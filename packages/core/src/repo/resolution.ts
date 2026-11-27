/**
 * Entity resolution I/O (plan 9.1, D-072): blocking queries that find candidate pairs, persistence
 * of scored pairs, and the /admin review queue. Scoring is pure (`../resolution`).
 */
import { sql, type SQL } from "drizzle-orm";
import { newId } from "../ids";
import { decide, explain, scoreCompanies, scorePeople, type CompanyRecord, type MatchScore, type PersonRecord } from "../resolution";
import { assertPlatformAdmin, type AdminContext } from "./admin";
import { mergeEntityRecords } from "./admin-console";
import { rawQuery as q } from "./entities";
import { NotFoundError } from "./workspace";

export type MatchKind = "company" | "person";

/** Blocks bigger than this are generic ("app", "group") and would explode quadratically. */
const MAX_BLOCK = 40;
/** Domain labels too generic to block on. */
const GENERIC_LABELS = ["app", "www", "go", "get", "try", "my", "the", "home", "shop", "web", "site", "info", "online"];

/** A text[] parameter (drizzle expands plain JS arrays into tuples); null → NULL::text[]. */
const textArray = (xs: readonly string[] | null): SQL =>
  xs === null ? sql`NULL::text[]` : xs.length ? sql`ARRAY[${sql.join(xs.map((x) => sql`${x}`), sql`, `)}]::text[]` : sql`'{}'::text[]`;

type CompanyPairRow = {
  a_id: string; a_name: string; a_domain: string; a_aliases: string[]; a_linkedin: string | null; a_country: string | null; a_city: string | null; a_founded: number | null;
  a_rank: number | null; a_rounds: number;
  b_id: string; b_name: string; b_domain: string; b_aliases: string[]; b_linkedin: string | null; b_country: string | null; b_city: string | null; b_founded: number | null;
  b_rank: number | null; b_rounds: number;
  cosine: number | null;
};

/**
 * Candidate company pairs (a.id < b.id), from three blocks: same registrable domain label, a domain
 * listed as the other's alias, and the same 6-character name key in the same country. Pairs a human
 * or the job already settled are skipped.
 */
export async function companyCandidatePairs(limit = 50_000, onlyIds: string[] | null = null): Promise<{ a: CompanyRecord; b: CompanyRecord; cosine: number | null; aScore: number; bScore: number }[]> {
  const rows = await q<CompanyPairRow>(sql`
    WITH live AS (
      SELECT id, name, domain, domain_aliases, socials, hq_country, hq_city, founded_year, rank, round_count, embedding,
        split_part(lower(domain), '.', 1) AS label,
        lower(left(regexp_replace(name, '[^a-zA-Z0-9]', '', 'g'), 6)) AS name_key
      FROM companies WHERE deleted_at IS NULL AND (${textArray(onlyIds)} IS NULL OR id = ANY(${textArray(onlyIds)}))
    ),
    by_label AS (
      SELECT id, label FROM (SELECT id, label, count(*) OVER (PARTITION BY label) AS n FROM live
        WHERE length(label) >= 3 AND label <> ALL(${textArray(GENERIC_LABELS)})) x WHERE n BETWEEN 2 AND ${MAX_BLOCK}
    ),
    by_name AS (
      SELECT id, name_key, hq_country FROM (SELECT id, name_key, hq_country, count(*) OVER (PARTITION BY name_key, hq_country) AS n FROM live
        WHERE length(name_key) >= 3 AND hq_country IS NOT NULL) x WHERE n BETWEEN 2 AND ${MAX_BLOCK}
    ),
    pairs AS (
      SELECT a.id AS a, b.id AS b FROM by_label a JOIN by_label b ON a.label = b.label AND a.id < b.id
      UNION
      SELECT a.id, b.id FROM by_name a JOIN by_name b ON a.name_key = b.name_key AND a.hq_country = b.hq_country AND a.id < b.id
      UNION
      SELECT LEAST(a.id, b.id), GREATEST(a.id, b.id) FROM live a JOIN live b ON b.domain = ANY(a.domain_aliases) AND a.id <> b.id
    )
    SELECT a.id AS a_id, a.name AS a_name, a.domain AS a_domain, a.domain_aliases AS a_aliases, a.socials->>'linkedin' AS a_linkedin,
      a.hq_country AS a_country, a.hq_city AS a_city, a.founded_year AS a_founded, a.rank AS a_rank, a.round_count AS a_rounds,
      b.id AS b_id, b.name AS b_name, b.domain AS b_domain, b.domain_aliases AS b_aliases, b.socials->>'linkedin' AS b_linkedin,
      b.hq_country AS b_country, b.hq_city AS b_city, b.founded_year AS b_founded, b.rank AS b_rank, b.round_count AS b_rounds,
      CASE WHEN a.embedding IS NOT NULL AND b.embedding IS NOT NULL THEN 1 - (a.embedding <=> b.embedding) END AS cosine
    FROM pairs p JOIN live a ON a.id = p.a JOIN live b ON b.id = p.b
    WHERE NOT EXISTS (SELECT 1 FROM entity_match_candidates m WHERE m.kind = 'company' AND m.left_id = p.a AND m.right_id = p.b AND m.status <> 'pending')
    LIMIT ${limit}`);
  const rec = (r: CompanyPairRow, s: "a" | "b"): CompanyRecord => ({
    id: r[`${s}_id`], name: r[`${s}_name`], domain: r[`${s}_domain`], domainAliases: r[`${s}_aliases`], linkedin: r[`${s}_linkedin`],
    hqCountry: r[`${s}_country`], hqCity: r[`${s}_city`], foundedYear: r[`${s}_founded`],
  });
  // Survivor preference: more funding history, then better rank.
  const keepScore = (rounds: number, rank: number | null) => rounds * 1_000_000 - (rank ?? 1_000_000);
  return rows.map((r) => ({ a: rec(r, "a"), b: rec(r, "b"), cosine: r.cosine == null ? null : Number(r.cosine), aScore: keepScore(r.a_rounds, r.a_rank), bScore: keepScore(r.b_rounds, r.b_rank) }));
}

type PersonPairRow = {
  a_id: string; a_name: string; a_linkedin: string | null; a_company: string | null; a_country: string | null; a_title: string | null; a_emails: string[] | null; a_signals: number; a_followers: number | null;
  b_id: string; b_name: string; b_linkedin: string | null; b_company: string | null; b_country: string | null; b_title: string | null; b_emails: string[] | null; b_signals: number; b_followers: number | null;
};

/**
 * Candidate person pairs: same normalised name at the same company (or in the same country when one
 * side has no employer), or a shared e-mail. Same name + country alone is mostly namesakes.
 */
export async function personCandidatePairs(limit = 50_000, onlyIds: string[] | null = null): Promise<{ a: PersonRecord; b: PersonRecord; aScore: number; bScore: number }[]> {
  const rows = await q<PersonPairRow>(sql`
    WITH live AS (
      SELECT id, full_name, linkedin_url, current_company_id, country, current_title, talent_signal_count, followers,
        lower(regexp_replace(full_name, '[^a-zA-Z0-9]', '', 'g')) AS name_key
      FROM people WHERE deleted_at IS NULL AND (${textArray(onlyIds)} IS NULL OR id = ANY(${textArray(onlyIds)}))
    ),
    blocked AS (
      SELECT * FROM (SELECT *, count(*) OVER (PARTITION BY name_key) AS n FROM live WHERE length(name_key) >= 5) x WHERE n BETWEEN 2 AND ${MAX_BLOCK}
    ),
    pairs AS (
      SELECT a.id AS a, b.id AS b FROM blocked a JOIN blocked b ON a.name_key = b.name_key AND a.id < b.id
        AND (a.current_company_id = b.current_company_id
          OR ((a.current_company_id IS NULL OR b.current_company_id IS NULL) AND a.country = b.country))
      UNION
      SELECT LEAST(x.person_id, y.person_id), GREATEST(x.person_id, y.person_id)
      FROM person_emails x JOIN person_emails y ON lower(x.email) = lower(y.email) AND x.person_id <> y.person_id
    ),
    emails AS (SELECT person_id, array_agg(lower(email)) AS emails FROM person_emails GROUP BY person_id)
    SELECT a.id AS a_id, a.full_name AS a_name, a.linkedin_url AS a_linkedin, a.current_company_id AS a_company, a.country AS a_country, a.current_title AS a_title,
      ea.emails AS a_emails, a.talent_signal_count AS a_signals, a.followers AS a_followers,
      b.id AS b_id, b.full_name AS b_name, b.linkedin_url AS b_linkedin, b.current_company_id AS b_company, b.country AS b_country, b.current_title AS b_title,
      eb.emails AS b_emails, b.talent_signal_count AS b_signals, b.followers AS b_followers
    FROM pairs p JOIN live a ON a.id = p.a JOIN live b ON b.id = p.b
    LEFT JOIN emails ea ON ea.person_id = a.id LEFT JOIN emails eb ON eb.person_id = b.id
    WHERE NOT EXISTS (SELECT 1 FROM entity_match_candidates m WHERE m.kind = 'person' AND m.left_id = p.a AND m.right_id = p.b AND m.status <> 'pending')
    LIMIT ${limit}`);
  const rec = (r: PersonPairRow, s: "a" | "b"): PersonRecord => ({
    id: r[`${s}_id`], fullName: r[`${s}_name`], linkedin: r[`${s}_linkedin`], currentCompanyId: r[`${s}_company`], country: r[`${s}_country`],
    title: r[`${s}_title`], emails: r[`${s}_emails`],
  });
  const keepScore = (signals: number, followers: number | null) => signals * 1_000_000 + (followers ?? 0);
  return rows.map((r) => ({ a: rec(r, "a"), b: rec(r, "b"), aScore: keepScore(r.a_signals, r.a_followers), bScore: keepScore(r.b_signals, r.b_followers) }));
}

/** Store (or refresh) a pending pair for review. */
export async function saveMatchCandidate(kind: MatchKind, leftId: string, rightId: string, s: MatchScore) {
  const [l, r] = leftId < rightId ? [leftId, rightId] : [rightId, leftId];
  await q(sql`
    INSERT INTO entity_match_candidates (id, kind, left_id, right_id, probability, weight, reason, comparisons)
    VALUES (${newId("matchCandidate")}, ${kind}, ${l}, ${r}, ${s.probability}, ${s.weight}, ${explain(s)}, ${JSON.stringify(s.comparisons)}::jsonb)
    ON CONFLICT (kind, left_id, right_id) DO UPDATE SET probability = EXCLUDED.probability, weight = EXCLUDED.weight, reason = EXCLUDED.reason,
      comparisons = EXCLUDED.comparisons, updated_at = now()
    WHERE entity_match_candidates.status = 'pending'`);
}

/** Record an automatic merge (the job calls mergeEntityRecords first). */
export async function recordAutoMerge(kind: MatchKind, keepId: string, dropId: string, s: MatchScore) {
  const [l, r] = keepId < dropId ? [keepId, dropId] : [dropId, keepId];
  await q(sql`
    INSERT INTO entity_match_candidates (id, kind, left_id, right_id, probability, weight, reason, comparisons, status, decided_by, decided_at)
    VALUES (${newId("matchCandidate")}, ${kind}, ${l}, ${r}, ${s.probability}, ${s.weight}, ${explain(s)}, ${JSON.stringify(s.comparisons)}::jsonb, 'auto_merged', 'system:resolution', now())
    ON CONFLICT (kind, left_id, right_id) DO UPDATE SET status = 'auto_merged', decided_by = 'system:resolution', decided_at = now(), updated_at = now()`);
}

export type ResolutionSummary = { pairs: number; autoMerged: number; queued: number; ignored: number; skipped: number };

/**
 * One resolution pass for a kind: block → score → auto-merge sure pairs (survivor = richer record)
 * → queue likely pairs. `dryRun` scores and counts without writing.
 */
export async function runResolution(kind: MatchKind, opts: { dryRun?: boolean; limit?: number; onlyIds?: string[] } = {}): Promise<ResolutionSummary> {
  const sum: ResolutionSummary = { pairs: 0, autoMerged: 0, queued: 0, ignored: 0, skipped: 0 };
  const scored =
    kind === "company"
      ? (await companyCandidatePairs(opts.limit, opts.onlyIds ?? null)).map((p) => ({ ...p, score: scoreCompanies(p.a, p.b, p.cosine) }))
      : (await personCandidatePairs(opts.limit, opts.onlyIds ?? null)).map((p) => ({ ...p, score: scorePeople(p.a, p.b) }));
  // Most certain first, so chains (A=B, B=C) merge into the strongest survivor.
  scored.sort((x, y) => y.score.weight - x.score.weight);
  const gone = new Set<string>();
  for (const p of scored) {
    sum.pairs++;
    const d = decide(p.score);
    if (d === "ignore") {
      sum.ignored++;
      continue;
    }
    if (gone.has(p.a.id) || gone.has(p.b.id)) {
      sum.skipped++;
      continue;
    }
    if (opts.dryRun) {
      if (d === "auto_merge") sum.autoMerged++;
      else sum.queued++;
      continue;
    }
    if (d === "auto_merge") {
      const [keep, drop] = p.aScore >= p.bScore ? [p.a.id, p.b.id] : [p.b.id, p.a.id];
      await mergeEntityRecords({ actor: "system:resolution", actorType: "system" }, keep, drop);
      await recordAutoMerge(kind, keep, drop, p.score);
      gone.add(drop);
      sum.autoMerged++;
    } else {
      await saveMatchCandidate(kind, p.a.id, p.b.id, p.score);
      sum.queued++;
    }
  }
  return sum;
}

/* ------------------------------------------------------------------ */
/* /admin review queue                                                 */
/* ------------------------------------------------------------------ */

export type MatchCandidateRow = {
  id: string; kind: MatchKind; left_id: string; left_name: string; right_id: string; right_name: string; probability: number; reason: string; updated_at: string;
};

export function listMatchCandidates(a: AdminContext, limit = 30) {
  assertPlatformAdmin(a);
  return q<MatchCandidateRow>(sql`
    SELECT m.id, m.kind, m.left_id, COALESCE(lc.name, lp.full_name) AS left_name, m.right_id, COALESCE(rc.name, rp.full_name) AS right_name,
      m.probability, m.reason, m.updated_at
    FROM entity_match_candidates m
    LEFT JOIN companies lc ON m.kind = 'company' AND lc.id = m.left_id LEFT JOIN companies rc ON m.kind = 'company' AND rc.id = m.right_id
    LEFT JOIN people lp ON m.kind = 'person' AND lp.id = m.left_id LEFT JOIN people rp ON m.kind = 'person' AND rp.id = m.right_id
    WHERE m.status = 'pending' ORDER BY m.probability DESC, m.updated_at DESC LIMIT ${limit}`);
}

export async function matchQueueCounts(a: AdminContext) {
  assertPlatformAdmin(a);
  const rows = await q<{ status: string; n: number }>(sql`SELECT status, count(*)::int AS n FROM entity_match_candidates GROUP BY 1`);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>;
}

/** Merge a queued pair (`keepId` survives) or mark it "not a duplicate" so it never comes back. */
export async function decideMatchCandidate(a: AdminContext, id: string, verdict: { merge: true; keepId: string } | { merge: false }) {
  assertPlatformAdmin(a);
  const [m] = await q<{ left_id: string; right_id: string; status: string }>(sql`SELECT left_id, right_id, status FROM entity_match_candidates WHERE id = ${id}`);
  if (!m || m.status !== "pending") throw new NotFoundError("No pending match with that id");
  if (!verdict.merge) {
    await q(sql`UPDATE entity_match_candidates SET status = 'rejected', decided_by = ${a.email}, decided_at = now(), updated_at = now() WHERE id = ${id}`);
    return { merged: false as const };
  }
  if (verdict.keepId !== m.left_id && verdict.keepId !== m.right_id) throw new Error("Survivor must be one of the pair");
  const drop = verdict.keepId === m.left_id ? m.right_id : m.left_id;
  const moved = await mergeEntityRecords({ actor: a.email, actorType: "platform_admin" }, verdict.keepId, drop);
  return { merged: true as const, moved };
}
