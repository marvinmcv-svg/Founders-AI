// Fails if any copy key used in code is missing from content/copy/en.json, or any value is a TODO-COPY placeholder (plan Rule 8).
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const copy = JSON.parse(readFileSync("content/copy/en.json", "utf8"));
const get = (k) => k.split(".").reduce((o, p) => (o && typeof o === "object" ? o[p] : undefined), copy);
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = path.join(d, f); if (f === "node_modules" || f === ".next") continue; statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) && files.push(p); } };
walk("apps/www/src");
const missing = new Set();
let used = 0;
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/\bt(?:List|Objects)?(?:<[^>]+>)?\(\s*["'`]([a-zA-Z0-9_.]+)["'`]/g)) { used++; if (get(m[1]) === undefined) missing.add(`${m[1]}  (${f})`); }
}
const todo = JSON.stringify(copy).match(/TODO-COPY/g)?.length ?? 0;
console.log(`copy:check — ${used} static key uses, ${missing.size} missing, ${todo} TODO-COPY values`);
for (const m of missing) console.log("  missing:", m);
if (missing.size || todo) process.exit(1);
