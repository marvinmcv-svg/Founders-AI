/**
 * Loads the synthetic universe into a database with COPY, then creates the demo workspace.
 * Used by `pnpm db:seed` (run.ts) and by the app's token-protected /api/admin/seed endpoint
 * (for hosted databases that are only reachable from the deployment).
 */
import type postgres from "postgres";
import { hashPassword } from "better-auth/crypto";
import { createHash, randomBytes } from "node:crypto";
import { generate, type Cell } from "./generate";
import { encodeCopyRow } from "./copy";
import { seedDemoWorkspace } from "./demo";

export const SEED_ORDER = [
  "taxonomy_nodes", "schools", "investors", "companies", "people", "company_people", "person_experience", "person_education",
  "person_emails", "funding_rounds", "round_investors", "acquisitions", "ipos", "talent_signals", "news_items", "news_signals",
  "company_competitors", "company_estimates", "revenue_disclosures", "company_metrics_daily",
] as const;

export async function seedDatabase(sql: postgres.Sql, opts: { scale: number; log?: (line: string) => void }) {
  const log = opts.log ?? (() => {});
  const started = Date.now();
  const data = generate({ scale: opts.scale });
  log(`generated scale ${opts.scale} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  await sql.unsafe(`TRUNCATE ${SEED_ORDER.map((t) => `"${t}"`).join(", ")} CASCADE`);
  for (const name of SEED_ORDER) {
    const t = data.tables[name];
    if (t) await copy(sql, name, t.columns, t.rows, log);
  }
  await seedDemoWorkspace(sql, data.sample, {
    hashPassword,
    hashKey: (k: string) => createHash("sha256").update(k).digest("hex"),
    random: (n: number) => randomBytes(n).toString("hex"),
  });
  await sql`ANALYZE`;
  await sql`REFRESH MATERIALIZED VIEW platform_stats`;
  const [stats] = await sql`SELECT * FROM platform_stats`;
  log(`seed complete in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  return stats;
}

async function copy(sql: postgres.Sql, table: string, columns: string[], rows: Cell[][], log: (l: string) => void) {
  const t0 = Date.now();
  const writable = await sql`COPY ${sql(table)} (${sql(columns)}) FROM STDIN`.writable();
  const CHUNK = 5000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK).map(encodeCopyRow).join("");
    if (!writable.write(chunk)) await new Promise<void>((r) => writable.once("drain", () => r()));
  }
  await new Promise<void>((resolve, reject) => {
    writable.on("error", reject);
    writable.end(() => resolve());
  });
  await new Promise((r) => setTimeout(r, 10));
  log(`${table.padEnd(24)} ${rows.length.toLocaleString().padStart(10)} rows  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
