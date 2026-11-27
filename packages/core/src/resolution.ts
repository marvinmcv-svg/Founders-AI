/**
 * Entity resolution (plan 9.1): canonical keys + Fellegi–Sunter probabilistic matching (D-072).
 *
 *   keys     canonical domain, registrable label, LinkedIn slug, normalised company / person names
 *   compare  each field lands on a comparison level with m = P(level | same entity) and
 *            u = P(level | different entities); the match weight is Σ log2(m/u) + prior log-odds
 *   decide   ≥ AUTO_MERGE with a hard key (domain, LinkedIn, e-mail) → merge automatically;
 *            ≥ REVIEW → queue for a human in /admin; below → ignore
 *
 * Names alone never auto-merge: two "Nova Pay" companies in different countries are common.
 * Pure functions only; the pipeline job (packages/pipelines/src/jobs/resolution.ts) does the I/O.
 */

export const AUTO_MERGE_PROBABILITY = 0.995;
export const REVIEW_PROBABILITY = 0.8;
/** Prior: roughly 1 in 50 blocked pairs is a true duplicate. */
const PRIOR_LOG2_ODDS = Math.log2(1 / 49);

/* ------------------------------------------------------------------ */
/* Canonical keys                                                      */
/* ------------------------------------------------------------------ */

/** Hosts that identify a platform, not a company: a profile there is not a company domain. */
const PLATFORM_HOSTS = new Set([
  "linkedin.com", "facebook.com", "fb.com", "instagram.com", "twitter.com", "x.com", "tiktok.com", "youtube.com", "linktr.ee",
  "medium.com", "angel.co", "wellfound.com", "crunchbase.com", "google.com", "sites.google.com", "notion.site", "wa.me", "whatsapp.com",
  "bit.ly", "github.com", "apple.com", "play.google.com", "apps.apple.com",
]);

/** Second-level public suffixes common in our coverage (LatAm first). */
const MULTI_PART_SUFFIXES = new Set([
  "com.bo", "com.br", "com.ar", "com.mx", "com.co", "com.pe", "com.cl", "com.uy", "com.py", "com.ec", "com.ve", "com.gt", "com.pa",
  "com.do", "com.sv", "com.hn", "com.ni", "com.cr", "co.uk", "org.uk", "co.za", "com.au", "co.nz", "co.jp", "co.in", "com.sg",
  "com.es", "org.br", "net.br", "gob.bo", "gob.mx", "edu.bo",
]);

/** `https://www.Acme.com/about?x=1` → `acme.com`; platform hosts and garbage → null. */
export function canonicalDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = input.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  s = s.replace(/^[^@/]*@/, "");
  s = s.split(/[/?#]/)[0] ?? "";
  s = s.replace(/:\d+$/, "").replace(/\.$/, "");
  s = s.replace(/^(www\d?|m)\./, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s)) return null;
  if (PLATFORM_HOSTS.has(s)) return null;
  return s;
}

/** `acme.com.bo` → `acme`; `app.acme.io` → `acme`. Used to block, never to decide alone. */
export function registrableLabel(domain: string | null | undefined): string | null {
  const d = canonicalDomain(domain);
  if (!d) return null;
  const parts = d.split(".");
  const two = parts.slice(-2).join(".");
  const suffixLen = MULTI_PART_SUFFIXES.has(two) ? 2 : 1;
  return parts[parts.length - suffixLen - 1] ?? null;
}

/** LinkedIn company / person / school URL → `linkedin.com/<kind>/<slug>`; anything else → null. */
export function canonicalLinkedIn(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = input.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/^([a-z]{2,3}|www)\./, "");
  const m = /^linkedin\.com\/(company|in|school|showcase)\/([^/?#]+)/.exec(s);
  if (!m) return null;
  let slug = m[2] ?? "";
  try {
    slug = decodeURIComponent(slug);
  } catch {
    /* keep the raw slug */
  }
  return slug ? `linkedin.com/${m[1]}/${slug}` : null;
}

const stripAccents = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "");

const LEGAL_SUFFIXES = new Set([
  "inc", "incorporated", "llc", "llp", "lp", "ltd", "limited", "corp", "corporation", "co", "company", "plc", "gmbh", "ag", "bv", "nv",
  "sa", "sas", "sac", "saa", "srl", "sl", "spa", "ltda", "eireli", "me", "sapi", "sab", "cv", "de", "rl", "pte", "pty", "oy", "ab", "as",
]);

/** `Acme Pagos S.A. de C.V.` → `acme pagos`; keeps the words that identify the company. */
export function normalizeCompanyName(name: string | null | undefined): string {
  if (!name) return "";
  let s = stripAccents(name).toLowerCase().replace(/&/g, " and ");
  // Join dotted initials so "S.A." becomes "sa" before tokenising.
  s = s.replace(/\b([a-z])\.(?=[a-z]\.)/g, "$1").replace(/\b([a-z])\.(?=\s|$)/g, "$1");
  const tokens = s.replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  while (tokens.length > 1 && LEGAL_SUFFIXES.has(tokens[tokens.length - 1] ?? "")) tokens.pop();
  if (tokens.length > 1 && tokens[0] === "the") tokens.shift();
  return tokens.join(" ");
}

const HONORIFICS = new Set(["dr", "mr", "mrs", "ms", "prof", "ing", "lic", "sr", "sra", "srta", "don", "dona"]);
const NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "phd", "mba", "md", "cpa", "esq"]);

/** `Dr. José  Pérez-Gómez, MBA` → `jose perez gomez`. */
export function normalizePersonName(name: string | null | undefined): string {
  if (!name) return "";
  const tokens = stripAccents(name).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  while (tokens.length > 1 && HONORIFICS.has(tokens[0] ?? "")) tokens.shift();
  while (tokens.length > 1 && NAME_SUFFIXES.has(tokens[tokens.length - 1] ?? "")) tokens.pop();
  return tokens.join(" ");
}

/** Jaro–Winkler similarity in [0, 1]. */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return a.length ? 1 : 0;
  if (!a.length || !b.length) return 0;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aHit = new Array<boolean>(a.length).fill(false);
  const bHit = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const lo = Math.max(0, i - range);
    const hi = Math.min(b.length - 1, i + range);
    for (let j = lo; j <= hi; j++) {
      if (bHit[j] || a[i] !== b[j]) continue;
      aHit[i] = bHit[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let k = 0;
  let transpositions = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aHit[i]) continue;
    while (!bHit[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  const m = matches;
  const jaro = (m / a.length + m / b.length + (m - transpositions / 2) / m) / 3;
  let prefix = 0;
  while (prefix < 4 && prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

/* ------------------------------------------------------------------ */
/* Fellegi–Sunter scoring                                              */
/* ------------------------------------------------------------------ */

type Level = { label: string; m: number; u: number };
export type Comparison = { field: string; level: string; weight: number };
export type MatchScore = { probability: number; weight: number; hardKey: boolean; comparisons: Comparison[] };

function addLevel(out: Comparison[], field: string, lvl: Level | null) {
  if (!lvl) return; // missing on either side: no evidence either way
  out.push({ field, level: lvl.label, weight: Math.log2(lvl.m / lvl.u) });
}

function finish(comparisons: Comparison[], hardKey: boolean): MatchScore {
  const weight = PRIOR_LOG2_ODDS + comparisons.reduce((s, c) => s + c.weight, 0);
  const probability = 1 / (1 + 2 ** -weight);
  return { probability, weight: Math.round(weight * 100) / 100, hardKey, comparisons };
}

const nameLevel = (a: string, b: string, exact: [number, number], close: [number, number], near: [number, number], other: [number, number]): Level | null => {
  if (!a || !b) return null;
  if (a === b) return { label: "exact", m: exact[0], u: exact[1] };
  const jw = jaroWinkler(a, b);
  if (jw >= 0.94) return { label: "jw≥0.94", m: close[0], u: close[1] };
  if (jw >= 0.85) return { label: "jw≥0.85", m: near[0], u: near[1] };
  return { label: "different", m: other[0], u: other[1] };
};

const sameOrDiff = (a: string | null | undefined, b: string | null | undefined, same: [number, number], diff: [number, number]): Level | null => {
  const x = a?.trim().toLowerCase();
  const y = b?.trim().toLowerCase();
  if (!x || !y) return null;
  return x === y ? { label: "same", m: same[0], u: same[1] } : { label: "different", m: diff[0], u: diff[1] };
};

export type CompanyRecord = {
  id: string;
  name: string;
  domain?: string | null;
  domainAliases?: string[] | null;
  linkedin?: string | null;
  hqCountry?: string | null;
  hqCity?: string | null;
  foundedYear?: number | null;
};

const domainsOf = (r: CompanyRecord) =>
  new Set([r.domain, ...(r.domainAliases ?? [])].map((d) => canonicalDomain(d)).filter((d): d is string => !!d));

/** Score two company records; `cosine` is the embedding similarity when both have one. */
export function scoreCompanies(a: CompanyRecord, b: CompanyRecord, cosine?: number | null): MatchScore {
  const out: Comparison[] = [];
  const da = domainsOf(a);
  const db = domainsOf(b);
  const sharedDomain = [...da].some((d) => db.has(d));
  let domain: Level | null = null;
  if (da.size && db.size) {
    const la = new Set([...da].map(registrableLabel));
    const sameLabel = [...db].some((d) => la.has(registrableLabel(d)));
    domain = sharedDomain
      ? { label: "same", m: 0.9, u: 0.0001 }
      : sameLabel
        ? { label: "same label", m: 0.06, u: 0.002 }
        : { label: "different", m: 0.04, u: 0.9979 };
  }
  addLevel(out, "domain", domain);

  const la = canonicalLinkedIn(a.linkedin);
  const lb = canonicalLinkedIn(b.linkedin);
  const sameLinkedIn = !!la && la === lb;
  addLevel(out, "linkedin", la && lb ? (sameLinkedIn ? { label: "same", m: 0.6, u: 0.00005 } : { label: "different", m: 0.02, u: 0.99995 }) : null);

  addLevel(out, "name", nameLevel(normalizeCompanyName(a.name), normalizeCompanyName(b.name), [0.7, 0.001], [0.15, 0.004], [0.08, 0.03], [0.07, 0.965]));
  addLevel(out, "country", sameOrDiff(a.hqCountry, b.hqCountry, [0.95, 0.15], [0.05, 0.85]));
  addLevel(out, "city", sameOrDiff(a.hqCity, b.hqCity, [0.85, 0.05], [0.15, 0.95]));
  if (a.foundedYear && b.foundedYear) {
    const d = Math.abs(a.foundedYear - b.foundedYear);
    addLevel(out, "founded", d === 0 ? { label: "same", m: 0.85, u: 0.08 } : d === 1 ? { label: "±1", m: 0.1, u: 0.15 } : { label: "different", m: 0.05, u: 0.77 });
  }
  if (cosine != null && Number.isFinite(cosine)) {
    addLevel(out, "embedding", cosine >= 0.9 ? { label: "≥0.90", m: 0.6, u: 0.01 } : cosine >= 0.75 ? { label: "≥0.75", m: 0.3, u: 0.1 } : { label: "<0.75", m: 0.1, u: 0.89 });
  }
  return finish(out, sharedDomain || sameLinkedIn);
}

export type PersonRecord = {
  id: string;
  fullName: string;
  linkedin?: string | null;
  emails?: string[] | null;
  currentCompanyId?: string | null;
  country?: string | null;
  title?: string | null;
};

export function scorePeople(a: PersonRecord, b: PersonRecord): MatchScore {
  const out: Comparison[] = [];
  const la = canonicalLinkedIn(a.linkedin);
  const lb = canonicalLinkedIn(b.linkedin);
  const sameLinkedIn = !!la && la === lb;
  addLevel(out, "linkedin", la && lb ? (sameLinkedIn ? { label: "same", m: 0.7, u: 0.00001 } : { label: "different", m: 0.05, u: 0.99999 }) : null);

  const ea = new Set((a.emails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean));
  const eb = (b.emails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean);
  const sharedEmail = eb.some((e) => ea.has(e));
  if (sharedEmail) addLevel(out, "email", { label: "shared", m: 0.5, u: 0.00001 });

  addLevel(out, "name", nameLevel(normalizePersonName(a.fullName), normalizePersonName(b.fullName), [0.8, 0.0005], [0.12, 0.003], [0.05, 0.02], [0.03, 0.9765]));
  addLevel(out, "company", sameOrDiff(a.currentCompanyId, b.currentCompanyId, [0.8, 0.01], [0.2, 0.99]));
  addLevel(out, "country", sameOrDiff(a.country, b.country, [0.95, 0.2], [0.05, 0.8]));
  if (a.title && b.title) {
    const jw = jaroWinkler(a.title.toLowerCase(), b.title.toLowerCase());
    addLevel(out, "title", jw >= 0.9 ? { label: "similar", m: 0.6, u: 0.05 } : { label: "different", m: 0.4, u: 0.95 });
  }
  return finish(out, sameLinkedIn || sharedEmail);
}

export type MatchDecision = "auto_merge" | "review" | "ignore";

export function decide(s: MatchScore): MatchDecision {
  if (s.probability >= AUTO_MERGE_PROBABILITY && s.hardKey) return "auto_merge";
  if (s.probability >= REVIEW_PROBABILITY) return "review";
  return "ignore";
}

/** One-line human reason for the review queue, strongest evidence first. */
export function explain(s: MatchScore): string {
  return s.comparisons
    .filter((c) => c.weight > 0)
    .sort((x, y) => y.weight - x.weight)
    .slice(0, 4)
    .map((c) => `${c.field} ${c.level}`)
    .join(", ");
}
