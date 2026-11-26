/**
 * `pnpm pipelines <job|daily|list> [--key=value ...]`
 * Examples: `pnpm pipelines highlights --only=companies`, `pnpm pipelines talent --changes=500`.
 */
import "@founders/db/env";
import { closeAll } from "@founders/db";
import { DAILY, JOBS, MONTHLY, WEEKLY } from "./registry";
import { runJob } from "./runner";

const [name, ...rest] = process.argv.slice(2);
const options: Record<string, string | number | boolean> = {};
for (const a of rest) {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  if (!m?.[1]) continue;
  const v = m[2];
  options[m[1]] = v === undefined ? true : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
}

async function main() {
  if (!name || name === "list") {
    for (const j of Object.values(JOBS)) console.log(`${j.name.padEnd(14)} ${j.description}`);
    console.log(`${"daily".padEnd(14)} ${DAILY.join(" → ")}`);
    console.log(`${"weekly".padEnd(14)} ${WEEKLY.join(" → ")}`);
    console.log(`${"monthly".padEnd(14)} ${MONTHLY.join(" → ")}`);
    return;
  }
  const names = name === "daily" ? DAILY : name === "weekly" ? WEEKLY : name === "monthly" ? MONTHLY : [name];
  let failed = false;
  for (const n of names) {
    const job = JOBS[n];
    if (!job) throw new Error(`Unknown job "${n}". Try: pnpm pipelines list`);
    const r = await runJob(job, { trigger: "manual", options });
    console.log(`${r.status === "SUCCEEDED" ? "✓" : "✗"} ${r.job} ${r.status} in ${(r.ms / 1000).toFixed(1)}s ${JSON.stringify(r.counts)}`);
    if (r.error) console.error(r.error);
    failed ||= r.status === "FAILED";
  }
  if (failed) process.exitCode = 1;
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeAll());
