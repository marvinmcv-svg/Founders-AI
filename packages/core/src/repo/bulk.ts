/**
 * Bulk delivery (plan 13.5): per-project datasets → CSV/Parquet → S3 / GCS / Snowflake, full snapshot
 * first, then daily incrementals with an `op` column (upsert/delete) and stable IDs, plus a manifest
 * with checksums. Only redistributable fields leave the platform. Admin only.
 *
 * Incrementals are the exact diff against what this delivery last shipped (`bulk_state` content
 * hashes, D-058), so replaying full + incrementals in manifest order reproduces the current data.
 */
import { createHash } from "node:crypto";
import path from "node:path";
import {
  MemorySink,
  encodeDataset,
  localSink,
  s3Sink,
  sha256,
  snowflakeSink,
  type BulkFormat,
  type DeliveredFile,
  type ParquetColumn,
  type S3Config,
  type Sink,
  type SinkTransport,
  type SnowflakeConfig,
} from "@founders/integrations/bulk";
import { sql, type SQL } from "drizzle-orm";
import { decryptSecret, encryptSecret } from "../crypto";
import { egressFetch } from "../egress";
import { newId } from "../ids";
import { redistributable } from "../redistribution";
import { rawQuery as q } from "./entities";
import { ForbiddenError, NotFoundError, type OrgContext } from "./workspace";

export const BULK_DATASETS = ["companies", "people", "investors", "transactions", "estimates"] as const;
export type BulkDataset = (typeof BULK_DATASETS)[number];
export type BulkSinkKind = "S3" | "GCS" | "SNOWFLAKE" | "LOCAL";
export type BulkCadence = "DAILY" | "WEEKLY" | "MANUAL";

type DatasetDef = { label: string; columns: ParquetColumn[]; query: SQL };

const S = (name: string): ParquetColumn => ({ name, type: "string" });
const I = (name: string): ParquetColumn => ({ name, type: "int" });

/** Dataset definitions: stable public IDs, explicit columns (schema is part of the contract). */
export const DATASETS: Record<BulkDataset, DatasetDef> = {
  companies: {
    label: "Companies",
    columns: [S("id"), S("name"), S("domain"), S("tagline"), S("hq_city"), S("hq_country"), I("founded_year"), S("growth_stage"), I("employee_count"), I("total_funding_usd"), S("last_funding_date"), S("last_funding_type"), I("est_revenue_usd"), I("est_valuation_usd"), I("rank"), S("highlights")],
    query: sql`SELECT id, name, domain, tagline, hq_city, hq_country, founded_year, growth_stage, employee_count, total_funding_usd, last_funding_date::text AS last_funding_date,
      last_funding_type, est_revenue_usd, est_valuation_usd, rank, highlights, provenance FROM companies WHERE deleted_at IS NULL`,
  },
  people: {
    label: "People",
    columns: [S("id"), S("full_name"), S("current_title"), S("current_company_id"), S("country"), S("seniority"), S("linkedin_url"), S("highlights")],
    query: sql`SELECT id, full_name, current_title, current_company_id, country, seniority, linkedin_url, highlights, provenance FROM people WHERE deleted_at IS NULL`,
  },
  investors: {
    label: "Investors",
    columns: [S("id"), S("name"), S("type"), S("hq_country"), I("aum_usd"), I("investments_count"), I("exits_count")],
    query: sql`SELECT id, name, type, hq_country, aum_usd, investments_count, exits_count, provenance FROM investors WHERE deleted_at IS NULL`,
  },
  transactions: {
    label: "Transactions (rounds, acquisitions, IPOs)",
    columns: [S("id"), S("kind"), S("company_id"), S("type"), I("amount_usd"), S("date"), I("valuation_usd")],
    query: sql`SELECT id, 'ROUND' AS kind, company_id, type, amount_usd, announced_date::text AS date, post_money_usd AS valuation_usd, provenance FROM funding_rounds
      UNION ALL SELECT id, 'ACQUISITION', target_id, status, amount_usd, date::text, NULL, NULL FROM acquisitions
      UNION ALL SELECT id, 'IPO', company_id, exchange, raised_usd, date::text, valuation_usd, NULL FROM ipos`,
  },
  estimates: {
    label: "Revenue & valuation estimates",
    columns: [S("id"), S("company_id"), S("month"), I("revenue_p10"), I("revenue_p50"), I("revenue_p90"), S("revenue_type"), I("valuation_p10"), I("valuation_p50"), I("valuation_p90"), S("confidence"), S("model_version"), S("drivers"), S("anchors")],
    query: sql`WITH v AS (SELECT COALESCE((SELECT version FROM model_versions WHERE kind = 'REVENUE' AND active LIMIT 1), (SELECT max(model_version) FROM company_estimates)) AS version)
      SELECT DISTINCT ON (e.company_id) e.company_id AS id, e.company_id, e.month::text AS month, e.revenue_p10, e.revenue_p50, e.revenue_p90, e.revenue_type,
        e.valuation_p10, e.valuation_p50, e.valuation_p90, e.confidence, e.model_version, e.drivers,
        (SELECT jsonb_agg(jsonb_build_object('amount_usd', d.amount_usd, 'type', d.type, 'period', d.period, 'source_url', d.source_url) ORDER BY d.period)
          FROM revenue_disclosures d WHERE d.company_id = e.company_id AND d.status = 'verified') AS anchors
      FROM company_estimates e, v WHERE e.model_version = v.version ORDER BY e.company_id, e.month DESC`,
  },
};

type DeliveryRow = {
  id: string;
  org_id: string;
  name: string;
  datasets: BulkDataset[];
  fields: Partial<Record<BulkDataset, string[]>> | null;
  format: BulkFormat;
  sink: BulkSinkKind;
  sink_config: string;
  cadence: BulkCadence;
  status: string;
  last_run: string | null;
  created_by: string;
  created_at: string;
};

export type SinkConfig =
  | { kind: "S3"; bucket: string; region: string; prefix?: string; accessKeyId: string; secretAccessKey: string }
  | { kind: "GCS"; bucket: string; prefix?: string; accessKeyId: string; secretAccessKey: string }
  | { kind: "SNOWFLAKE"; stage: { kind: "S3" | "GCS"; bucket: string; region?: string; prefix?: string; accessKeyId: string; secretAccessKey: string }; snowflake: SnowflakeConfig }
  | { kind: "LOCAL" };

function assertAdmin(ctx: OrgContext) {
  if (ctx.role !== "owner" && ctx.role !== "admin") throw new ForbiddenError("Only workspace admins can manage bulk delivery");
}

/* ------------------------------------------------------------------ */
/* Sinks                                                                */
/* ------------------------------------------------------------------ */

function egressSinkTransport(hosts: string[]): SinkTransport {
  return async (req) => {
    const r = await egressFetch(req.url, { method: req.method, headers: req.headers, ...(req.body !== undefined ? { body: req.body } : {}) }, { allowHosts: hosts, timeoutMs: 120_000, maxBytes: 1024 * 1024 });
    return { status: r.status, body: r.body };
  };
}

function stageConfig(c: { kind: "S3" | "GCS"; bucket: string; region?: string; prefix?: string; accessKeyId: string; secretAccessKey: string }): S3Config {
  return c.kind === "GCS"
    ? { bucket: c.bucket, region: "auto", endpoint: "storage.googleapis.com", accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey, ...(c.prefix ? { prefix: c.prefix } : {}) }
    : { bucket: c.bucket, region: c.region ?? "us-east-1", accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey, ...(c.prefix ? { prefix: c.prefix } : {}) };
}

/** Test seam: route every delivery to one sink (e.g. a MemorySink). */
let sinkOverride: ((d: { id: string; sink: BulkSinkKind }) => Sink) | null = null;
export function setBulkSinkForTests(f: ((d: { id: string; sink: BulkSinkKind }) => Sink) | null) {
  sinkOverride = f;
}

function buildSink(d: DeliveryRow): Sink {
  if (sinkOverride) return sinkOverride(d);
  const c = JSON.parse(decryptSecret(d.sink_config)) as SinkConfig;
  switch (c.kind) {
    case "S3":
    case "GCS": {
      const sc = stageConfig(c);
      return s3Sink(sc, egressSinkTransport([sc.endpoint ?? `s3.${sc.region}.amazonaws.com`]), c.kind);
    }
    case "SNOWFLAKE": {
      const sc = stageConfig(c.stage);
      const stage = s3Sink(sc, egressSinkTransport([sc.endpoint ?? `s3.${sc.region}.amazonaws.com`]), c.stage.kind);
      return snowflakeSink(c.snowflake, stage, egressSinkTransport([`${c.snowflake.account.toLowerCase()}.snowflakecomputing.com`]));
    }
    case "LOCAL": {
      const root = process.env.BULK_LOCAL_DIR;
      if (!root) throw new ForbiddenError("Local delivery is only available in development (BULK_LOCAL_DIR)");
      return localSink(path.join(root, d.id));
    }
  }
}

function validateSink(c: SinkConfig) {
  const bucket = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
  if (c.kind === "LOCAL") {
    if (!process.env.BULK_LOCAL_DIR) throw new ForbiddenError("Local delivery is only available in development");
    return;
  }
  const st = c.kind === "SNOWFLAKE" ? c.stage : c;
  if (!bucket.test(st.bucket)) throw new ForbiddenError("Enter a valid bucket name");
  if (!st.accessKeyId || !st.secretAccessKey) throw new ForbiddenError("Enter the access key and secret");
  if ("region" in st && st.region && !/^[a-z0-9-]{2,30}$/.test(st.region)) throw new ForbiddenError("Enter a valid region");
  if (c.kind === "SNOWFLAKE") {
    const s = c.snowflake;
    if (!/^[A-Za-z0-9_.-]{3,80}$/.test(s.account)) throw new ForbiddenError("Enter the Snowflake account locator");
    for (const k of ["user", "warehouse", "database", "schema", "stage"] as const) if (!/^[A-Za-z_][A-Za-z0-9_$]{0,254}$/.test(s[k])) throw new ForbiddenError(`Invalid Snowflake ${k}`);
    if (!/BEGIN (RSA )?PRIVATE KEY/.test(s.privateKeyPem)) throw new ForbiddenError("Paste the PKCS#8 private key registered on the Snowflake user");
  }
}

/* ------------------------------------------------------------------ */
/* Projects                                                             */
/* ------------------------------------------------------------------ */

export type CreateBulkInput = { name: string; datasets: BulkDataset[]; format: BulkFormat; cadence: BulkCadence; sink: SinkConfig; fields?: Partial<Record<BulkDataset, string[]>> };

export async function createBulkDelivery(ctx: OrgContext, input: CreateBulkInput) {
  assertAdmin(ctx);
  const datasets = [...new Set(input.datasets)].filter((d) => (BULK_DATASETS as readonly string[]).includes(d));
  if (!datasets.length) throw new ForbiddenError("Pick at least one dataset");
  if (!input.name.trim()) throw new ForbiddenError("Name the delivery");
  validateSink(input.sink);
  const fields: Partial<Record<BulkDataset, string[]>> = {};
  for (const d of datasets) {
    const want = input.fields?.[d];
    if (!want?.length) continue;
    const allowed = DATASETS[d].columns.map((c) => c.name);
    fields[d] = ["id", ...want.filter((f) => f !== "id" && allowed.includes(f))];
  }
  const id = newId("bulkDelivery");
  await q(sql`INSERT INTO bulk_deliveries (id, org_id, name, datasets, fields, format, sink, sink_config, cadence, created_by)
    VALUES (${id}, ${ctx.orgId}, ${input.name.trim().slice(0, 120)}, ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(datasets)}::jsonb)), ${JSON.stringify(fields)}::jsonb,
      ${input.format === "CSV" ? "CSV" : "PARQUET"}, ${input.sink.kind}, ${encryptSecret(JSON.stringify(input.sink))}, ${["DAILY", "WEEKLY", "MANUAL"].includes(input.cadence) ? input.cadence : "DAILY"}, ${ctx.userId})`);
  await q(sql`INSERT INTO audit_log (id, org_id, actor, action, target) VALUES (${newId("event")}, ${ctx.orgId}, ${ctx.userId}, 'bulk.create', ${id})`);
  return { id };
}

export async function listBulkDeliveries(ctx: OrgContext) {
  const rows = await q<Omit<DeliveryRow, "sink_config">>(sql`SELECT id, org_id, name, datasets, fields, format, sink, cadence, status, last_run, created_by, created_at
    FROM bulk_deliveries WHERE org_id = ${ctx.orgId} ORDER BY created_at DESC`);
  const runs = await q<{ id: string; delivery_id: string; kind: string; status: string; manifest: Record<string, unknown> | null; error: string | null; started_at: string; finished_at: string | null }>(sql`
    SELECT id, delivery_id, kind, status, manifest, error, started_at, finished_at FROM (
      SELECT r.*, row_number() OVER (PARTITION BY delivery_id ORDER BY started_at DESC) AS rn FROM bulk_runs r WHERE r.org_id = ${ctx.orgId}) x WHERE rn <= 5 ORDER BY started_at DESC`);
  return rows.map((d) => ({ ...d, runs: runs.filter((r) => r.delivery_id === d.id) }));
}

export async function deleteBulkDelivery(ctx: OrgContext, id: string) {
  assertAdmin(ctx);
  const r = await q(sql`DELETE FROM bulk_deliveries WHERE id = ${id} AND org_id = ${ctx.orgId} RETURNING id`);
  if (!r.length) throw new NotFoundError("Delivery not found");
  await q(sql`DELETE FROM bulk_state WHERE delivery_id = ${id}`);
  await q(sql`INSERT INTO audit_log (id, org_id, actor, action, target) VALUES (${newId("event")}, ${ctx.orgId}, ${ctx.userId}, 'bulk.delete', ${id})`);
}

/* ------------------------------------------------------------------ */
/* Runs                                                                 */
/* ------------------------------------------------------------------ */

const rowHash = (columns: ParquetColumn[], r: Record<string, unknown>) =>
  createHash("sha1")
    .update(JSON.stringify(columns.map((c) => r[c.name] ?? null)))
    .digest("hex")
    .slice(0, 20);

export type BulkManifest = {
  delivery_id: string;
  run_id: string;
  kind: "FULL" | "INCREMENTAL";
  generated_at: string;
  format: BulkFormat;
  previous_run_id: string | null;
  files: (DeliveredFile & { upserts: number; deletes: number })[];
  schemas: Record<string, ParquetColumn[]>;
  snowflake_statements?: string[];
};

export async function runBulkDelivery(ctx: OrgContext, id: string, opts: { full?: boolean; trigger?: string; now?: Date } = {}): Promise<{ runId: string; status: "SUCCEEDED" | "FAILED"; manifest?: BulkManifest; error?: string }> {
  if (opts.trigger !== "schedule") assertAdmin(ctx);
  const [d] = await q<DeliveryRow>(sql`SELECT * FROM bulk_deliveries WHERE id = ${id} AND org_id = ${ctx.orgId}`);
  if (!d) throw new NotFoundError("Delivery not found");
  const [hasState] = await q(sql`SELECT 1 FROM bulk_state WHERE delivery_id = ${id} LIMIT 1`);
  const kind: "FULL" | "INCREMENTAL" = opts.full || !hasState ? "FULL" : "INCREMENTAL";
  const runId = newId("bulkRun");
  const now = opts.now ?? new Date();
  await q(sql`INSERT INTO bulk_runs (id, delivery_id, org_id, kind, status) VALUES (${runId}, ${id}, ${ctx.orgId}, ${kind}, 'RUNNING')`);
  try {
    const sink = buildSink(d);
    const day = now.toISOString().slice(0, 10);
    const [{ n: sameDay } = { n: 0 }] = await q<{ n: number }>(sql`SELECT count(*)::int AS n FROM bulk_runs WHERE delivery_id = ${id} AND status = 'SUCCEEDED' AND left(manifest->>'generated_at', 10) = ${day}`);
    const suffix = sameDay ? `_${sameDay + 1}` : "";
    const [prev] = await q<{ id: string }>(sql`SELECT id FROM bulk_runs WHERE delivery_id = ${id} AND status = 'SUCCEEDED' ORDER BY started_at DESC LIMIT 1`);
    const files: BulkManifest["files"] = [];
    const schemas: Record<string, ParquetColumn[]> = {};
    const newState: { dataset: string; rows: { entity_id: string; hash: string }[] }[] = [];

    for (const ds of d.datasets) {
      const def = DATASETS[ds];
      const pick = d.fields?.[ds];
      const columns = [{ name: "op", type: "string" as const }, ...def.columns.filter((c) => !pick?.length || pick.includes(c.name))];
      schemas[ds] = columns;
      const current = (await q<Record<string, unknown>>(def.query)).map((r) => redistributable(r)).filter((r) => r.id);
      const hashes = new Map(current.map((r) => [String(r.id), rowHash(columns, r)]));
      let out: Record<string, unknown>[];
      let deletes = 0;
      if (kind === "FULL") out = current.map((r) => ({ ...r, op: "upsert" }));
      else {
        const prevRows = await q<{ entity_id: string; hash: string }>(sql`SELECT entity_id, hash FROM bulk_state WHERE delivery_id = ${id} AND dataset = ${ds}`);
        const before = new Map(prevRows.map((r) => [r.entity_id, r.hash]));
        out = current.filter((r) => before.get(String(r.id)) !== hashes.get(String(r.id))).map((r) => ({ ...r, op: "upsert" }));
        for (const pid of before.keys()) if (!hashes.has(pid)) out.push({ id: pid, op: "delete" });
        deletes = out.length - out.filter((r) => r.op === "upsert").length;
      }
      const enc = encodeDataset(d.format, columns, out, { dataset: ds, kind, run_id: runId });
      const key = `${ds}/${ds}${kind === "FULL" ? "_full" : ""}_${day}${suffix}.${enc.ext}`;
      await sink.put(key, enc.body, enc.contentType);
      files.push({ dataset: ds, kind, key, uri: sink.uri(key), rows: out.length, bytes: enc.body.length, sha256: sha256(enc.body), format: d.format, upserts: out.length - deletes, deletes });
      newState.push({ dataset: ds, rows: [...hashes.entries()].map(([entity_id, hash]) => ({ entity_id, hash })) });
    }

    const manifest: BulkManifest = { delivery_id: id, run_id: runId, kind, generated_at: now.toISOString(), format: d.format, previous_run_id: prev?.id ?? null, files, schemas };
    if (sink.finish) manifest.snowflake_statements = (await sink.finish(files)).statements;
    const manifestBody = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
    await sink.put(`manifests/manifest_${day}${suffix}.json`, manifestBody, "application/json");

    // Only once every file is delivered does the baseline move (a failed run is simply retried).
    for (const st of newState) {
      await q(sql`DELETE FROM bulk_state WHERE delivery_id = ${id} AND dataset = ${st.dataset}`);
      for (let i = 0; i < st.rows.length; i += 20_000) {
        await q(sql`INSERT INTO bulk_state (delivery_id, dataset, entity_id, hash)
          SELECT ${id}, ${st.dataset}, x.entity_id, x.hash FROM jsonb_to_recordset(${JSON.stringify(st.rows.slice(i, i + 20_000))}::jsonb) AS x(entity_id text, hash text)`);
      }
    }
    await q(sql`UPDATE bulk_runs SET status = 'SUCCEEDED', manifest = ${JSON.stringify({ ...manifest, schemas: undefined })}::jsonb, finished_at = now() WHERE id = ${runId}`);
    await q(sql`UPDATE bulk_deliveries SET last_run = now(), status = 'ACTIVE' WHERE id = ${id}`);
    return { runId, status: "SUCCEEDED", manifest };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await q(sql`UPDATE bulk_runs SET status = 'FAILED', error = ${msg}, finished_at = now() WHERE id = ${runId}`);
    await q(sql`UPDATE bulk_deliveries SET status = 'ERROR' WHERE id = ${id}`);
    return { runId, status: "FAILED", error: msg };
  }
}

/** Daily job: run every delivery whose cadence is due (first run is the full snapshot). */
export async function runDueBulkDeliveries(opts: { now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const rows = await q<{ id: string; org_id: string; created_by: string; cadence: BulkCadence; last_run: string | null }>(sql`
    SELECT id, org_id, created_by, cadence, last_run FROM bulk_deliveries WHERE cadence <> 'MANUAL'`);
  let ran = 0;
  let failed = 0;
  for (const r of rows) {
    const ageH = r.last_run ? (now.getTime() - new Date(r.last_run).getTime()) / 3_600_000 : Infinity;
    if (ageH < (r.cadence === "DAILY" ? 20 : 24 * 6.5)) continue;
    const res = await runBulkDelivery({ orgId: r.org_id, userId: r.created_by, role: "admin" }, r.id, { trigger: "schedule", now });
    if (res.status === "SUCCEEDED") ran++;
    else failed++;
  }
  return { deliveries: rows.length, ran, failed };
}

export { MemorySink };
