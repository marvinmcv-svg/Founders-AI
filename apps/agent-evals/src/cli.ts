/**
 * `pnpm --filter @founders/agent-evals eval [--engine rules|claude] [--only id,id]`
 * Prints a per-prompt table and a summary; exits 1 if any prompt fails.
 */
import { config } from "dotenv";
config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const args = process.argv.slice(2);
const arg = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const { runEvals, summarize } = await import("./run");
const { getSql } = await import("@founders/db");
const engine = arg("engine") as "rules" | "claude" | undefined;
const grades = await runEvals({ engine, only: arg("only")?.split(",") });
for (const g of grades) {
  const failed = Object.entries(g.checks).filter(([, v]) => !v).map(([k]) => k);
  console.log(`${g.pass ? "PASS" : "FAIL"}  ${g.id.padEnd(7)} ${g.engine.padEnd(6)} ${String(g.ms).padStart(5)}ms  ${g.prompt.slice(0, 70)}${failed.length ? `  ✗ ${failed.join(",")}` : ""}${g.unsourced.length ? `  unsourced=${g.unsourced.join("|")}` : ""}${g.uncited.length ? `  uncited=${JSON.stringify(g.uncited.slice(0, 2))}` : ""}`);
}
console.log(JSON.stringify(summarize(grades), null, 2));
await getSql().end({ timeout: 1 });
process.exit(grades.every((g) => g.pass) ? 0 : 1);
