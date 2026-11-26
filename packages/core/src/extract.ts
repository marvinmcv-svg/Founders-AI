/**
 * Entity extraction, step 1 (plan 11 #42): find candidate mentions in free text without any I/O.
 * Step 2 (repo/extract.ts) resolves them against companies, investors and people.
 *
 * Deterministic by design: identifiers (LinkedIn URLs, emails, domains) are exact keys; names are
 * runs of capitalised tokens, offered with every contiguous sub-span so "Acme Robotics CEO Jane Doe"
 * can match both "Acme Robotics" and "Jane Doe". Resolution keeps the longest non-overlapping matches.
 */
export type MentionKind = "linkedin" | "email" | "domain" | "name";
export type Mention = { kind: MentionKind; text: string; key: string; start: number; end: number };

const LINKEDIN = /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(in|company)\/[A-Za-z0-9_%-]+\/?/gi;
const EMAIL = /\b[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})\b/g;
const DOMAIN = /\b(?:https?:\/\/)?(?:www\.)?((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24})(?:\/[^\s)"'<>]*)?/gi;
const TOKEN = /[A-Z][\p{L}\p{N}'’&.-]*|[A-Z]{2,}/gu;
const CONNECTORS = new Set(["of", "and", "&", "de", "la", "the", "for", "y", "do", "da"]);
/** Capitalised words that start sentences or headlines and are almost never part of a name. */
const STOP = new Set(
  "The A An In On At For From With And But Or If When While After Before Today Yesterday This That These Those It Its Our We They He She His Her Their Your You I CEO CTO CFO COO VP Inc Ltd LLC Corp Co Series Seed Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September October November December According Meanwhile However Also New".split(" "),
);
const FILE_TLDS = new Set(["png", "jpg", "jpeg", "gif", "pdf", "csv", "txt", "js", "ts", "json", "md", "html"]);
export const MAX_SPAN_TOKENS = 5;

const clean = (s: string) => s.replace(/[’']s$/u, "").replace(/[.,;:!?)]+$/, "");

export function findMentions(text: string): Mention[] {
  const out: Mention[] = [];
  const taken: [number, number][] = [];
  const overlaps = (s: number, e: number) => taken.some(([a, b]) => s < b && e > a);
  const push = (m: Mention) => {
    out.push(m);
    taken.push([m.start, m.end]);
  };

  for (const m of text.matchAll(LINKEDIN)) push({ kind: "linkedin", text: m[0], key: m[0].toLowerCase().replace(/\/$/, ""), start: m.index, end: m.index + m[0].length });
  for (const m of text.matchAll(EMAIL)) if (!overlaps(m.index, m.index + m[0].length)) push({ kind: "email", text: m[0], key: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length });
  for (const m of text.matchAll(DOMAIN)) {
    const host = m[1]!.toLowerCase();
    const tld = host.split(".").pop() ?? "";
    if (FILE_TLDS.has(tld) || overlaps(m.index, m.index + m[0].length)) continue;
    // "Inc." / "e.g." style false positives need at least one dot-separated label of 2+ chars before the TLD.
    if (!/[a-z0-9-]{2,}\.[a-z]{2,24}$/.test(host)) continue;
    push({ kind: "domain", text: m[0], key: host.replace(/^www\./, ""), start: m.index, end: m.index + m[0].length });
  }

  // Runs of capitalised tokens (connectors allowed inside a run).
  type Tok = { text: string; start: number; end: number };
  const words: Tok[] = [];
  for (const m of text.matchAll(/[\p{L}\p{N}][\p{L}\p{N}'’&.-]*|&/gu)) words.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  let run: Tok[] = [];
  const flush = () => {
    while (run.length && CONNECTORS.has(run[run.length - 1]!.text.toLowerCase())) run.pop();
    for (let i = 0; i < run.length; i++) {
      for (let j = i; j < Math.min(run.length, i + MAX_SPAN_TOKENS); j++) {
        const first = run[i]!;
        const last = run[j]!;
        if (CONNECTORS.has(first.text.toLowerCase())) continue;
        if (i === j && STOP.has(clean(first.text))) continue;
        const raw = text.slice(first.start, last.end);
        const name = clean(raw);
        if (name.length < 2 || overlaps(first.start, last.end)) continue;
        out.push({ kind: "name", text: name, key: name.toLowerCase(), start: first.start, end: first.start + name.length });
      }
    }
    run = [];
  };
  for (const w of words) {
    const cap = TOKEN.test(w.text);
    TOKEN.lastIndex = 0;
    const gap = run.length ? text.slice(run[run.length - 1]!.end, w.start) : "";
    const breaks = /[.!?;:\n,()"]/.test(gap);
    if (breaks) flush();
    if (cap) run.push(w);
    else if (run.length && CONNECTORS.has(w.text.toLowerCase())) run.push(w);
    else flush();
  }
  flush();
  return out;
}

export type Resolved = { mention: Mention; type: "company" | "investor" | "person"; id: string; name: string; confidence: number };

/** Keep the best non-overlapping matches: identifiers first, then longer names, then confidence. */
export function pickNonOverlapping(cands: Resolved[]): Resolved[] {
  const rank = (r: Resolved) => (r.mention.kind === "name" ? 0 : 1);
  const sorted = [...cands].sort((a, b) => rank(b) - rank(a) || (b.mention.end - b.mention.start) - (a.mention.end - a.mention.start) || b.confidence - a.confidence);
  const kept: Resolved[] = [];
  for (const c of sorted) {
    if (kept.some((k) => c.mention.start < k.mention.end && c.mention.end > k.mention.start)) continue;
    kept.push(c);
  }
  return kept.sort((a, b) => a.mention.start - b.mention.start);
}
