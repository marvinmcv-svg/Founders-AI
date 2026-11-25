/**
 * `pnpm db:seed` — loads the synthetic universe with COPY, then creates the demo workspace.
 * Idempotent: truncates seeded tables first. Scale with SEED_SCALE (default 1 = plan sizes).
 */
import { DATABASE_URL } from "@founders/db/env";
import postgres from "postgres";
import { hashPassword } from "better-auth/crypto";
import { createHash, randomBytes } from "node:crypto";
import { generate, type Cell } from "./generate";
import { encodeCopyRow } from "./copy";
import { seedDemoWorkspace } from "./demo";

const scale = Number(process.env.SEED_SCALE ?? "1");
const started = Date.now();
const sql = postgres(DATABASE_URL, { max: 4, onnotice: () => {} });

console.log(`Generating synthetic universe (scale ${scale})…`);
const data = generate({ scale });
console.log(`  generated in ${((Date.now() - started) / 1000).toFixed(1)}s`);

const ORDER = [
  "taxonomy_nodes",
  "schools",
  "investors",
  "companies",
  "people",
  "company_people",
  "person_experience",
  "person_education",
  "person_emails",
  "funding_rounds",
  "round_investors",
  "acquisitions",
  "ipos",
  "talent_signals",
  "news_items",
  "news_signals",
  "company_competitors",
  "company_estimates",
  "revenue_disclosures",
  "company_metrics_daily",
] as const;

await sql.unsafe(`TRUNCATE ${ORDER.map((t) => `"${t}"`).join(", ")} CASCADE`);

async function copy(table: string, columns: string[], rows: Cell[][]) {
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
  // `end` callback fires when flushed; wait for the server to finish the COPY.
  await new Promise((r) => setTimeout(r, 10));
  console.log(`  ${table.padEnd(24)} ${rows.length.toLocaleString().padStart(10)} rows  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

for (const name of ORDER) {
  const t = data.tables[name];
  if (t) await copy(name, t.columns, t.rows);
}

await seedDemoWorkspace(sql, data.sample, {
  hashPassword,
  hashKey: (k: string) => createHash("sha256").update(k).digest("hex"),
  random: (n: number) => randomBytes(n).toString("hex"),
});

await sql`ANALYZE`;
await sql`REFRESH MATERIALIZED VIEW platform_stats`;
const [stats] = await sql`SELECT * FROM platform_stats`;
console.log("platform_stats:", stats);
console.log(`✓ seed complete in ${((Date.now() - started) / 1000).toFixed(1)}s`);
await sql.end();
process.exit(0);
