/**
 * Talent signals (plan 9.3). Pure functions: detect a signal from a before/after person snapshot,
 * score it 1–10 with a calibrated logistic model, and summarise it from structured facts only.
 * The pipeline job (packages/pipelines/src/jobs/talent.ts) does the I/O.
 */
import model from "./talent-model.json";

export type TalentSignalType = "NEW_COMPANY" | "NEW_ROLE" | "PROMOTION" | "SEARCHING" | "OUT_OF_STEALTH" | "DEPARTURE";
export type TalentStatus = "STEALTH" | "HR" | "LIVE";

export type Role = {
  companyId: string | null;
  companyName: string;
  title: string;
  seniority: string | null;
  department?: string | null;
  isFounder: boolean;
  start: string | null;
  /** Founded year of the company, when known (used for "< 12 months old"). */
  companyFoundedYear?: number | null;
};

export type PersonSnapshot = {
  headline: string | null;
  current: Role[];
};

export type DetectContext = {
  /** "Breakout" companies whose departures we track (top-ranked / headcount surge). */
  breakoutCompanyIds: Set<string>;
  today: Date;
};

export type Detection = {
  type: TalentSignalType;
  status: TalentStatus;
  newRole: Role | null;
  prevRole: Role | null;
  newCompanyId: string | null;
  prevCompanyIds: string[];
};

const SENIORITY_RANK: Record<string, number> = { Intern: 0, IC: 1, "Senior IC": 2, Manager: 3, Director: 4, VP: 5, "C-Level": 6, Founder: 7 };

/** Founder titles that are NOT a new company (side projects, communities, advisory). */
const SIDE_PROJECT = /\b(advisor|adviser|mentor|podcast|newsletter|community|meetup|chapter|club|angel|board member|volunteer)\b/i;
const FOUNDER_TITLE = /\b(co-?founder|founder)\b/i;
const STEALTH = /\bstealth\b/i;
const SEARCHING_HEADLINE = /\b(exploring|next chapter|open to|what'?s next|sabbatical|looking for)\b/i;

export const isStealthRole = (r: Role) => STEALTH.test(r.companyName) || (r.companyId === null && FOUNDER_TITLE.test(r.title) && /^(stealth|undisclosed)/i.test(r.companyName));
export const isFounderRole = (r: Role) => (r.isFounder || FOUNDER_TITLE.test(r.title)) && !SIDE_PROJECT.test(r.title);

const sameCompany = (a: Role, b: Role) =>
  (a.companyId && b.companyId && a.companyId === b.companyId) || (!a.companyId && !b.companyId && a.companyName.toLowerCase() === b.companyName.toLowerCase());

function isYoungCompany(r: Role, today: Date): boolean {
  if (isStealthRole(r)) return true;
  if (!r.companyFoundedYear) return false;
  return today.getUTCFullYear() - r.companyFoundedYear <= 1;
}

/**
 * Rules, in precedence order (plan 9.3):
 * OUT_OF_STEALTH > NEW_COMPANY > PROMOTION > DEPARTURE (from breakout) > SEARCHING > NEW_ROLE.
 * Returns null for cosmetic edits, lateral moves, side projects and advisory roles.
 */
export function detectTalentSignal(before: PersonSnapshot, after: PersonSnapshot, ctx: DetectContext): Detection | null {
  const ended = before.current.filter((b) => !after.current.some((a) => sameCompany(a, b)));
  const started = after.current.filter((a) => !before.current.some((b) => sameCompany(a, b)));
  const kept = after.current.filter((a) => before.current.some((b) => sameCompany(a, b)));
  const prevRole = ended[0] ?? before.current[0] ?? null;
  const prevCompanyIds = [...new Set(ended.map((r) => r.companyId).filter((x): x is string => Boolean(x)))];

  // OUT_OF_STEALTH: a stealth founder role was replaced by the same role at a named company.
  const stealthEnded = ended.find((r) => isStealthRole(r) && isFounderRole(r));
  const namedStarted = started.find((r) => isFounderRole(r) && !isStealthRole(r));
  if (stealthEnded && namedStarted) {
    return { type: "OUT_OF_STEALTH", status: "LIVE", newRole: namedStarted, prevRole: stealthEnded, newCompanyId: namedStarted.companyId, prevCompanyIds };
  }

  // NEW_COMPANY: a founder title at a company < 12 months old or in stealth.
  const founded = started.find((r) => isFounderRole(r) && isYoungCompany(r, ctx.today));
  if (founded) {
    const stealth = isStealthRole(founded);
    return { type: "NEW_COMPANY", status: stealth ? "STEALTH" : "LIVE", newRole: founded, prevRole, newCompanyId: stealth ? null : founded.companyId, prevCompanyIds };
  }

  // PROMOTION: same company, seniority strictly up.
  for (const a of kept) {
    const b = before.current.find((x) => sameCompany(a, x));
    if (!b) continue;
    const up = (SENIORITY_RANK[a.seniority ?? ""] ?? -1) > (SENIORITY_RANK[b.seniority ?? ""] ?? 99);
    if (up && a.title.trim().toLowerCase() !== b.title.trim().toLowerCase()) {
      return { type: "PROMOTION", status: "LIVE", newRole: a, prevRole: b, newCompanyId: a.companyId, prevCompanyIds: [] };
    }
  }

  const realStarted = started.filter((r) => !SIDE_PROJECT.test(r.title));
  const nowEmployed = kept.some((r) => !SIDE_PROJECT.test(r.title)) || realStarted.length > 0;

  // DEPARTURE from a tracked breakout company.
  const breakoutExit = ended.find((r) => r.companyId && ctx.breakoutCompanyIds.has(r.companyId));
  if (breakoutExit && !realStarted.length) {
    return { type: "DEPARTURE", status: nowEmployed ? "LIVE" : "HR", newRole: null, prevRole: breakoutExit, newCompanyId: null, prevCompanyIds };
  }

  // SEARCHING: left a role and holds no current role (or says so in the headline).
  if (ended.length && !nowEmployed) {
    return { type: "SEARCHING", status: "HR", newRole: null, prevRole, newCompanyId: null, prevCompanyIds };
  }
  if (!ended.length && !started.length && SEARCHING_HEADLINE.test(after.headline ?? "") && !SEARCHING_HEADLINE.test(before.headline ?? "") && !nowEmployed) {
    return { type: "SEARCHING", status: "HR", newRole: null, prevRole, newCompanyId: null, prevCompanyIds };
  }

  // NEW_ROLE: a real role at a different company.
  const moved = realStarted.find((r) => !r.isFounder);
  if (moved && ended.length) {
    return { type: "NEW_ROLE", status: "LIVE", newRole: moved, prevRole, newCompanyId: moved.companyId, prevCompanyIds };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Score (1–10)                                                        */
/* ------------------------------------------------------------------ */

export type TalentFeatures = {
  priorExit: boolean;
  priorIpo: boolean;
  serialFounder: boolean;
  majorEmployer: boolean;
  topUniversity: boolean;
  seniorityRank: number; // 0..7
  yearsExperience: number;
  connectionsPct: number; // 0..1
  type: TalentSignalType;
  daysSinceSignal: number;
};

export type TalentModel = {
  version: string;
  intercept: number;
  weights: Record<string, number>;
  /** Score = 1 + 9 · sigmoid(z); `calibration` documents how the weights were obtained. */
  calibration: string;
};

export const TALENT_MODEL = model as TalentModel;

/** Feature vector (names must match the model's `weights`). Exported for the trainer. */
export function featureVector(f: TalentFeatures): Record<string, number> {
  return {
    prior_exit: f.priorExit ? 1 : 0,
    prior_ipo: f.priorIpo ? 1 : 0,
    serial_founder: f.serialFounder ? 1 : 0,
    major_employer: f.majorEmployer ? 1 : 0,
    top_university: f.topUniversity ? 1 : 0,
    seniority: f.seniorityRank / 7,
    log_years: Math.log1p(Math.max(0, f.yearsExperience)) / Math.log1p(40),
    connections_pct: Math.min(1, Math.max(0, f.connectionsPct)),
    type_new_company: f.type === "NEW_COMPANY" ? 1 : 0,
    type_out_of_stealth: f.type === "OUT_OF_STEALTH" ? 1 : 0,
    type_departure: f.type === "DEPARTURE" ? 1 : 0,
    type_searching: f.type === "SEARCHING" ? 1 : 0,
    type_promotion: f.type === "PROMOTION" ? 1 : 0,
    recency: Math.exp(-Math.max(0, f.daysSinceSignal) / 90),
  };
}

export function scoreTalentSignal(f: TalentFeatures, m: TalentModel = TALENT_MODEL): { score: number; probability: number; contributions: Record<string, number> } {
  const x = featureVector(f);
  const contributions: Record<string, number> = {};
  let z = m.intercept;
  for (const [k, v] of Object.entries(x)) {
    const c = (m.weights[k] ?? 0) * v;
    contributions[k] = Math.round(c * 1000) / 1000;
    z += c;
  }
  const p = 1 / (1 + Math.exp(-z));
  return { score: Math.max(1, Math.min(10, Math.round(1 + 9 * p))), probability: Math.round(p * 1000) / 1000, contributions };
}

export const seniorityRank = (s: string | null | undefined) => SENIORITY_RANK[s ?? ""] ?? 1;

/* ------------------------------------------------------------------ */
/* Summary (facts only)                                                */
/* ------------------------------------------------------------------ */

export type TalentFacts = {
  person_name: string;
  type: TalentSignalType;
  new_title: string | null;
  new_company: string | null;
  stealth: boolean;
  vertical: string | null;
  prev_title: string | null;
  prev_company: string | null;
  prev_tenure_years: number | null;
  highlights: string[];
};

export function buildFacts(name: string, d: Detection, extra: { vertical: string | null; highlights: string[]; today: Date }): TalentFacts {
  const tenure = d.prevRole?.start ? (extra.today.getTime() - new Date(d.prevRole.start).getTime()) / (365.25 * 86_400_000) : null;
  return {
    person_name: name,
    type: d.type,
    new_title: d.newRole?.title ?? null,
    new_company: d.newRole && !isStealthRole(d.newRole) ? d.newRole.companyName : null,
    stealth: d.status === "STEALTH",
    vertical: extra.vertical,
    prev_title: d.prevRole?.title ?? null,
    prev_company: d.prevRole && !isStealthRole(d.prevRole) ? d.prevRole.companyName : null,
    prev_tenure_years: tenure !== null && tenure > 0 ? Math.round(tenure) : null,
    highlights: extra.highlights.slice(0, 3),
  };
}

const HIGHLIGHT_PHRASE: Record<string, string> = {
  "Serial Founder": "serial founder",
  "Prior Exit": "prior exit",
  "Prior IPO": "prior IPO",
  "Major Tech Experience": "major tech experience",
};

/** Deterministic two-sentence summary from facts (the fallback and the LLM's reference). */
export function templateSummary(f: TalentFacts): string {
  const prev = f.prev_title && f.prev_company ? `${f.prev_title} at ${f.prev_company}` : f.prev_company ?? null;
  const tenure = f.prev_tenure_years ? ` after ${f.prev_tenure_years} year${f.prev_tenure_years === 1 ? "" : "s"}` : "";
  const hl = f.highlights.length ? ` Highlights: ${f.highlights.map((h) => HIGHLIGHT_PHRASE[h] ?? h).join(", ")}.` : "";
  const vertical = f.vertical ? ` (${f.vertical})` : "";
  switch (f.type) {
    case "NEW_COMPANY":
      return f.stealth
        ? `${f.person_name} is building a stealth company${vertical}${prev ? `, previously ${prev}` : ""}.${hl}`
        : `${f.person_name} co-founded ${f.new_company}${vertical}${prev ? ` after ${prev}` : ""}.${hl}`;
    case "OUT_OF_STEALTH":
      return `${f.new_company} came out of stealth with ${f.person_name} as ${f.new_title ?? "founder"}${vertical}.${hl}`;
    case "PROMOTION":
      return `${f.person_name} was promoted to ${f.new_title} at ${f.new_company}${prev ? `, up from ${f.prev_title}` : ""}.${hl}`;
    case "NEW_ROLE":
      return `${f.person_name} joined ${f.new_company} as ${f.new_title}${prev ? `, moving from ${prev}` : ""}.${hl}`;
    case "DEPARTURE":
      return `${f.person_name} left ${f.prev_company ?? "a tracked breakout company"}${tenure}${f.prev_title ? ` as ${f.prev_title}` : ""}.${hl}`;
    case "SEARCHING":
      return `${f.person_name} left ${prev ?? "their last role"}${tenure} and has no current role listed.${hl}`;
  }
}

/** Every number and capitalised name in an LLM summary must appear in the facts (no hallucination). */
export function summaryIsGrounded(summary: string, f: TalentFacts): boolean {
  const factText = JSON.stringify(f).toLowerCase();
  const numbers = summary.match(/\d+(?:[.,]\d+)?/g) ?? [];
  if (numbers.some((n) => !factText.includes(n.toLowerCase()))) return false;
  const names = summary.match(/\b[A-Z][\p{L}&.'-]+(?:\s+[A-Z][\p{L}&.'-]+)*/gu) ?? [];
  const allowed = new Set(["The", "A", "An", "After", "Previously", "In", "As", "He", "She", "They", "Their", "Stealth", "Highlights"]);
  const ok = (w: string) => {
    const word = w.replace(/^[.'-]+|[.,;:'-]+$/g, "");
    return !word || allowed.has(word) || factText.includes(word.toLowerCase());
  };
  return names.every((n) => n.split(/\s+/).every(ok));
}

export const TALENT_SUMMARY_SCHEMA = {
  type: "object",
  properties: { summary: { type: "string" } },
  required: ["summary"],
  additionalProperties: false,
} as const;

export const TALENT_SUMMARY_SYSTEM =
  "You write two-sentence talent signal summaries for investors. Use ONLY the JSON facts given. " +
  "Do not add numbers, companies, schools or claims that are not in the facts. Neutral tone, no hype, max 45 words.";
