/**
 * Talent signals job (plan 9.3), < 24h freshness.
 *   1. ingest  — provider → person_changes (bronze)
 *   2. process — detect → apply to silver (person_experience, company_people, people) → score →
 *                fact-grounded summary → talent_signals → outbox
 *   3. eval    — precision/recall against labels (synthetic feed only) → model_versions.metrics
 * Options: --changes=N (synthetic ingest size, default 300), --seed=N, --llmLimit=N, --noIngest
 */
import { llmAvailable, structuredCall } from "@founders/core/llm";
import { newId } from "@founders/core/ids";
import { Rng } from "@founders/core/random";
import {
  buildFacts,
  detectTalentSignal,
  scoreTalentSignal,
  seniorityRank,
  summaryIsGrounded,
  TALENT_MODEL,
  TALENT_SUMMARY_SCHEMA,
  TALENT_SUMMARY_SYSTEM,
  templateSummary,
  type Detection,
  type PersonSnapshot,
  type TalentFacts,
  type TalentSignalType,
} from "@founders/core/signals/talent";
import { pg, type Json } from "../db";
import { emit } from "../outbox";
import { SyntheticPersonChangeFeed, type PersonChangeFeed } from "../providers/person-changes";
import type { JobContext, JobDef } from "../runner";

export const TALENT_DETECTOR_VERSION = "talent-detector-v1";

type ChangeRow = { id: string; person_id: string; observed_at: Date; before: PersonSnapshot; after: PersonSnapshot; label: string | null; source: string };
type PersonInfo = { id: string; full_name: string; highlights: string[]; years_experience: number | null; conn_pct: number | null };

async function ingest(ctx: JobContext, feed: PersonChangeFeed, limit: number, today: Date) {
  const sql = pg();
  const records = await feed.fetch({ limit, today });
  const rows = records.map((r) => ({
    id: newId("change"),
    person_id: r.personId,
    source: r.source,
    observed_at: r.observedAt.toISOString(),
    before: r.before,
    after: r.after,
    label: r.label,
  }));
  for (let i = 0; i < rows.length; i += 1000) {
    await sql`INSERT INTO person_changes (id, person_id, source, observed_at, before, after, label)
      SELECT x.id, x.person_id, x.source, x.observed_at, x.before, x.after, x.label
      FROM jsonb_to_recordset(${sql.json(rows.slice(i, i + 1000))}) AS x(id text, person_id text, source text, observed_at timestamptz, before jsonb, after jsonb, label text)`;
  }
  ctx.count("changes_ingested", rows.length);
  ctx.log(`ingested ${rows.length} changes from ${feed.name}`);
}

/** Apply the after-snapshot to the silver tables (experience timeline, current role, company links). */
async function applyToSilver(change: ChangeRow) {
  const sql = pg();
  const { before, after } = change;
  const at = change.observed_at.toISOString().slice(0, 10);
  const same = (a: PersonSnapshot["current"][number], b: PersonSnapshot["current"][number]) =>
    (a.companyId && a.companyId === b.companyId) || (!a.companyId && !b.companyId && a.companyName === b.companyName);
  await sql.begin(async (tx) => {
    for (const b of before.current) {
      const a = after.current.find((x) => same(x, b));
      if (a && a.title === b.title) continue; // unchanged role
      await tx`UPDATE person_experience SET is_current = false, "end" = ${at}
        WHERE person_id = ${change.person_id} AND is_current AND company_name = ${b.companyName}`;
      if (b.companyId && !a) await tx`UPDATE company_people SET is_current = false, "end" = ${at} WHERE person_id = ${change.person_id} AND company_id = ${b.companyId}`;
    }
    for (const a of after.current) {
      const b = before.current.find((x) => same(x, a));
      if (b && a.title === b.title) continue;
      await tx`INSERT INTO person_experience (id, person_id, company_id, company_name, title, department, start, is_current, is_founder)
        VALUES (${newId("experience")}, ${change.person_id}, ${a.companyId}, ${a.companyName}, ${a.title}, ${a.department ?? null}, ${at}, true, ${a.isFounder})`;
      if (a.companyId)
        await tx`INSERT INTO company_people (company_id, person_id, title, department, seniority, is_founder, start, is_current)
          VALUES (${a.companyId}, ${change.person_id}, ${a.title}, ${a.department ?? null}, ${a.seniority}, ${a.isFounder}, ${at}, true)
          ON CONFLICT (company_id, person_id) DO UPDATE SET title = EXCLUDED.title, seniority = EXCLUDED.seniority, is_founder = EXCLUDED.is_founder, is_current = true, "end" = NULL`;
    }
    const primary = after.current.find((r) => r.seniority !== null) ?? null;
    await tx`UPDATE people SET headline = ${after.headline}, current_title = ${primary?.title ?? null}, current_company_id = ${primary?.companyId ?? null},
      current_company_name = ${primary?.companyName ?? null}, seniority = COALESCE(${primary?.seniority ?? null}, seniority)
      WHERE id = ${change.person_id}`;
  });
}

async function summarise(facts: TalentFacts, budget: { left: number }, ctx: JobContext): Promise<{ text: string; by: "llm" | "template" }> {
  if (budget.left > 0 && llmAvailable()) {
    budget.left--;
    const res = await structuredCall<{ summary: string }>({
      system: TALENT_SUMMARY_SYSTEM,
      user: JSON.stringify(facts),
      schema: TALENT_SUMMARY_SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 300,
    });
    if (res?.summary && summaryIsGrounded(res.summary, facts)) return { text: res.summary.trim(), by: "llm" };
    if (res?.summary) ctx.count("llm_summaries_rejected_ungrounded");
  }
  return { text: templateSummary(facts), by: "template" };
}

async function processChanges(ctx: JobContext, today: Date) {
  const sql = pg();
  const changes = await sql<ChangeRow[]>`SELECT id, person_id, observed_at, before, after, label, source FROM person_changes
    WHERE processed_at IS NULL ORDER BY observed_at ASC LIMIT 5000`;
  if (!changes.length) return [] as { change: ChangeRow; detection: Detection | null }[];
  const breakout = new Set(
    (await sql<{ id: string }[]>`SELECT id FROM companies WHERE rank <= 1000 OR 'headcount_surge' = ANY(highlights)`).map((r) => r.id),
  );
  const personIds = [...new Set(changes.map((c) => c.person_id))];
  const info = new Map(
    (
      await sql<PersonInfo[]>`WITH r AS (SELECT id, cume_dist() OVER (ORDER BY connections NULLS FIRST) AS conn_pct FROM people)
        SELECT p.id, p.full_name, p.highlights, p.years_experience, r.conn_pct FROM people p JOIN r ON r.id = p.id WHERE p.id = ANY(${personIds})`
    ).map((p) => [p.id, p]),
  );
  const companyIds = [...new Set(changes.flatMap((c) => c.after.current.map((r) => r.companyId)).filter((x): x is string => Boolean(x)))];
  const verticals = new Map(
    (
      await sql<{ id: string; vertical: string | null }[]>`SELECT c.id, t.name AS vertical FROM companies c
        LEFT JOIN taxonomy_nodes t ON t.id = c.tech_vertical_ids[1] WHERE c.id = ANY(${companyIds})`
    ).map((r) => [r.id, r.vertical]),
  );

  const budget = { left: Number(ctx.options.llmLimit ?? 50) };
  const results: { change: ChangeRow; detection: Detection | null }[] = [];
  const signals: { [k: string]: Json }[] = [];
  const counts = new Map<string, number>();
  for (const change of changes) {
    const detection = detectTalentSignal(change.before, change.after, { breakoutCompanyIds: breakout, today });
    results.push({ change, detection });
    await applyToSilver(change);
    if (!detection) {
      await sql`UPDATE person_changes SET processed_at = now() WHERE id = ${change.id}`;
      ctx.count("changes_no_signal");
      continue;
    }
    const p = info.get(change.person_id);
    const hl = p?.highlights ?? [];
    const scored = scoreTalentSignal({
      priorExit: hl.includes("Prior Exit"),
      priorIpo: hl.includes("Prior IPO"),
      serialFounder: hl.includes("Serial Founder"),
      majorEmployer: hl.includes("Major Tech Experience"),
      topUniversity: hl.includes("Top University"),
      seniorityRank: seniorityRank(detection.newRole?.seniority ?? detection.prevRole?.seniority),
      yearsExperience: p?.years_experience ?? 0,
      connectionsPct: p?.conn_pct ?? 0,
      type: detection.type,
      daysSinceSignal: Math.max(0, (today.getTime() - change.observed_at.getTime()) / 86_400_000),
    });
    const vertical = detection.newCompanyId ? (verticals.get(detection.newCompanyId) ?? null) : null;
    const facts = buildFacts(p?.full_name ?? "This person", detection, {
      vertical,
      highlights: hl.filter((h) => ["Serial Founder", "Prior Exit", "Prior IPO", "Major Tech Experience"].includes(h)),
      today,
    });
    const summary = await summarise(facts, budget, ctx);
    const id = newId("talentSignal");
    signals.push({
      id,
      person_id: change.person_id,
      type: detection.type,
      status: detection.status,
      score: scored.score,
      summary: summary.text,
      signal_date: change.observed_at.toISOString().slice(0, 10),
      new_company_id: detection.newCompanyId,
      prev_company_ids: detection.prevCompanyIds,
      sources: [{ kind: change.source }],
      facts: { ...(facts as unknown as { [k: string]: Json }), score_probability: scored.probability, score_contributions: scored.contributions, summary_by: summary.by },
      model_version: `${TALENT_DETECTOR_VERSION}/${TALENT_MODEL.version}`,
      change_id: change.id,
    });
    counts.set(detection.type, (counts.get(detection.type) ?? 0) + 1);
    ctx.count(`summaries_${summary.by}`);
  }

  for (let i = 0; i < signals.length; i += 1000) {
    const chunk = signals.slice(i, i + 1000);
    await sql`INSERT INTO talent_signals (id, person_id, type, status, score, summary, signal_date, new_company_id, prev_company_ids, sources, facts, model_version)
      SELECT x.id, x.person_id, x.type, x.status, x.score, x.summary, x.signal_date, x.new_company_id,
        ARRAY(SELECT jsonb_array_elements_text(x.prev_company_ids)), x.sources, x.facts, x.model_version
      FROM jsonb_to_recordset(${sql.json(chunk)}) AS x(id text, person_id text, type text, status text, score int, summary text,
        signal_date date, new_company_id text, prev_company_ids jsonb, sources jsonb, facts jsonb, model_version text)`;
    await sql`UPDATE person_changes c SET processed_at = now(), signal_id = x.id
      FROM jsonb_to_recordset(${sql.json(chunk.map((s) => ({ id: s.id, change_id: s.change_id })))}) AS x(id text, change_id text) WHERE c.id = x.change_id`;
  }
  if (signals.length) {
    await sql`UPDATE people p SET talent_signal_count = p.talent_signal_count + x.n
      FROM (SELECT person_id, count(*)::int AS n FROM talent_signals WHERE id = ANY(${signals.map((s) => String(s.id))}) GROUP BY 1) x WHERE p.id = x.person_id`;
    await emit("talent_signals", signals.map((s) => String(s.id)));
    await emit("people", signals.map((s) => String(s.person_id)), "UPDATED");
  }
  ctx.count("signals_created", signals.length);
  for (const [t, n] of counts) ctx.count(`signals_${t}`, n);
  ctx.log(`processed ${changes.length} changes → ${signals.length} signals ${JSON.stringify(Object.fromEntries(counts))}`);
  return results;
}

export type TalentEval = {
  labelled: number;
  detections: number;
  correct: number;
  precision: number;
  recall: number;
  perType: Record<string, { tp: number; fp: number; fn: number; precision: number | null; recall: number | null }>;
};

/** Precision = detections whose type matches the ground-truth label / all detections. */
export function evaluateTalent(pairs: { label: string | null; detected: TalentSignalType | null }[]): TalentEval {
  const labelled = pairs.filter((p) => p.label !== null);
  const types = ["NEW_COMPANY", "NEW_ROLE", "PROMOTION", "SEARCHING", "OUT_OF_STEALTH", "DEPARTURE"];
  const perType: TalentEval["perType"] = {};
  for (const t of types) {
    const tp = labelled.filter((p) => p.detected === t && p.label === t).length;
    const fp = labelled.filter((p) => p.detected === t && p.label !== t).length;
    const fn = labelled.filter((p) => p.label === t && p.detected !== t).length;
    perType[t] = { tp, fp, fn, precision: tp + fp ? tp / (tp + fp) : null, recall: tp + fn ? tp / (tp + fn) : null };
  }
  const detections = labelled.filter((p) => p.detected !== null).length;
  const correct = labelled.filter((p) => p.detected !== null && p.detected === p.label).length;
  const positives = labelled.filter((p) => p.label !== "NONE").length;
  return { labelled: labelled.length, detections, correct, precision: detections ? correct / detections : 0, recall: positives ? correct / positives : 0, perType };
}

export const talentJob: JobDef = {
  name: "talent",
  description: "Ingest the person change feed, detect + score + summarise talent signals, evaluate precision",
  async run(ctx) {
    const today = new Date();
    if (!ctx.options.noIngest) {
      const feed = new SyntheticPersonChangeFeed(new Rng(Number(ctx.options.seed ?? Date.now() % 2 ** 31)));
      await ingest(ctx, feed, Number(ctx.options.changes ?? 300), today);
    }
    const results = await processChanges(ctx, today);
    const ev = evaluateTalent(results.map((r) => ({ label: r.change.label, detected: r.detection?.type ?? null })));
    if (ev.labelled) {
      ctx.count("eval_precision_pct", Math.round(ev.precision * 1000) / 10);
      ctx.count("eval_recall_pct", Math.round(ev.recall * 1000) / 10);
      const sql = pg();
      // Cumulative eval over every labelled change processed so far (not only this run).
      const all = await sql<{ label: string; type: TalentSignalType | null }[]>`SELECT c.label, s.type FROM person_changes c
        LEFT JOIN talent_signals s ON s.id = c.signal_id WHERE c.label IS NOT NULL AND c.processed_at IS NOT NULL`;
      const cum = evaluateTalent(all.map((r) => ({ label: r.label, detected: r.type })));
      await sql`INSERT INTO model_versions (version, kind, active, metrics) VALUES (${TALENT_DETECTOR_VERSION}, 'TALENT_DETECTOR', true, ${sql.json({ ...cum, evaluated_at: today.toISOString(), ground_truth: "synthetic feed labels" } as unknown as Json)})
        ON CONFLICT (version) DO UPDATE SET metrics = EXCLUDED.metrics, active = true`;
      ctx.log(`eval (this run): precision ${(ev.precision * 100).toFixed(1)}% recall ${(ev.recall * 100).toFixed(1)}% · cumulative n=${cum.labelled} precision ${(cum.precision * 100).toFixed(1)}%`);
    }
  },
};
