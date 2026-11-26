// Copy similarity check (plan 15 Phase 9, Rule 1): fails if any shipped string shares >= 8 consecutive
// words with the reference site's text. Reference text lives OUTSIDE the repo (AGENTS.md: ~/recon-raw),
// in COPY_REFERENCE_DIR (default ~/recon-raw/text). Without it the check is skipped (D-011: recon not run).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const N = 8;

export function words(s) {
  return s.toLowerCase().replace(/<[^>]+>/g, " ").replace(/[^\p{L}\p{N}\s'-]/gu, " ").split(/\s+/).filter(Boolean);
}

export function shingles(text, n = N) {
  const w = words(text);
  const out = new Set();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(" "));
  return out;
}

/** Returns shipped strings that share an n-word run with the reference, with the first matching run. */
export function findOverlaps(shipped, reference, n = N) {
  const ref = shingles(reference, n);
  const hits = [];
  for (const s of shipped) {
    const w = words(s.text);
    for (let i = 0; i + n <= w.length; i++) {
      const run = w.slice(i, i + n).join(" ");
      if (ref.has(run)) {
        hits.push({ where: s.where, run });
        break;
      }
    }
  }
  return hits;
}

function collectShipped(root) {
  const out = [];
  const walk = (v, where) => {
    if (typeof v === "string") out.push({ where, text: v });
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${where}[${i}]`));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, where ? `${where}.${k}` : k);
  };
  walk(JSON.parse(readFileSync(path.join(root, "content/copy/en.json"), "utf8")), "");
  for (const dir of ["content/blog", "content/comparisons"]) {
    const abs = path.join(root, dir);
    if (!existsSync(abs)) continue;
    for (const f of readdirSync(abs)) {
      if (f.startsWith("_") || !/\.(md|json)$/.test(f)) continue;
      const raw = readFileSync(path.join(abs, f), "utf8");
      if (f.endsWith(".json")) walk(JSON.parse(raw), `${dir}/${f}`);
      else raw.split(/\n\s*\n/).forEach((p, i) => out.push({ where: `${dir}/${f}#p${i + 1}`, text: p }));
    }
  }
  return out;
}

function readReference(dir) {
  const parts = [];
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = path.join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(txt|md|html)$/.test(f)) parts.push(readFileSync(p, "utf8"));
    }
  };
  walk(dir);
  return parts.join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const root = process.cwd();
  const refDir = process.env.COPY_REFERENCE_DIR ?? path.join(homedir(), "recon-raw", "text");
  const shipped = collectShipped(root);
  if (!existsSync(refDir)) {
    console.log(`copy:similarity — skipped: no reference text at ${refDir} (D-011). ${shipped.length} shipped strings ready to check.`);
    process.exit(0);
  }
  const hits = findOverlaps(shipped, readReference(refDir));
  console.log(`copy:similarity — ${shipped.length} shipped strings, ${hits.length} with a ${N}-word overlap`);
  for (const h of hits) console.log(`  overlap: ${h.where}  "${h.run}"`);
  if (hits.length) process.exit(1);
}
