/**
 * Curated skill library (plan 10.2). Read-only; users duplicate one to edit it. Each skill is a
 * named playbook: ordered natural-language steps the model follows (and the rules engine maps to a
 * fixed tool plan), what it needs as input, and the shape of the output.
 */
export type SkillInputKind = "text" | "company" | "person" | "investor" | "list" | "search";
export type Skill = {
  slug: string;
  name: string;
  description: string;
  steps: string[];
  inputs: { name: string; label: string; kind: SkillInputKind }[];
  outputFormat: string;
  curated: boolean;
};

const s = (x: Omit<Skill, "curated">): Skill => ({ ...x, curated: true });

export const CURATED_SKILLS: Skill[] = [
  s({
    slug: "company-brief",
    name: "Company brief",
    description: "One-page brief on a company: what it does, traction, funding, team, news and competitors.",
    inputs: [{ name: "company", label: "Company", kind: "company" }],
    steps: ["Read the company profile.", "Read revenue and valuation estimates and funding rounds.", "Read the team and recent talent moves.", "Read the latest news.", "List the closest competitors.", "Write the brief with a source chip on every fact."],
    outputFormat: "## Snapshot · ## Traction · ## Funding & financials · ## Team · ## News · ## Competitors",
  }),
  s({
    slug: "diligence-brief",
    name: "Diligence brief",
    description: "Deeper first-pass diligence: brief plus revenue/valuation in context of peers, risks and open questions. Saved as a memo.",
    inputs: [{ name: "company", label: "Company", kind: "company" }],
    steps: ["Run the company brief steps.", "Compare revenue, growth and funding with the closest competitors.", "List risks visible in the data (slowing headcount, no recent round, concentrated investors).", "List open questions for the founders.", "Save the result as a memo."],
    outputFormat: "## Summary · ## Business · ## Financials vs peers · ## Team · ## Risks · ## Questions for founders",
  }),
  s({
    slug: "founder-check",
    name: "Founder check",
    description: "Background on a founder or executive: career, education, prior companies, highlights and talent signals.",
    inputs: [{ name: "person", label: "Person", kind: "person" }],
    steps: ["Read the person's profile, career history and education.", "Read their talent signals.", "Summarise prior companies and outcomes.", "Note strengths and gaps."],
    outputFormat: "## Who · ## Career · ## Education · ## Signals · ## Read",
  }),
  s({
    slug: "fund-intel",
    name: "Fund intel",
    description: "What an investor backs: stages, sectors, check size, recent deals, co-investors.",
    inputs: [{ name: "investor", label: "Investor", kind: "investor" }],
    steps: ["Read the investor profile.", "Read the stage mix and recent portfolio.", "List top co-investors.", "Summarise the investment pattern."],
    outputFormat: "## Profile · ## Pattern · ## Recent deals · ## Co-investors",
  }),
  s({
    slug: "competitor-map",
    name: "Competitor map",
    description: "Head-to-head table of a company and its closest competitors.",
    inputs: [{ name: "company", label: "Company", kind: "company" }],
    steps: ["Read the company profile.", "Find competitors with overlap scores.", "Build a comparison table (stage, HQ, headcount, growth, funding).", "Call out who is growing fastest."],
    outputFormat: "Table + 3–5 bullet takeaways",
  }),
  s({
    slug: "market-map",
    name: "Market map",
    description: "Map a segment: the leading companies grouped by stage, with momentum.",
    inputs: [{ name: "segment", label: "Segment (e.g. fintech in Mexico)", kind: "text" }],
    steps: ["Search companies in the segment.", "Group them by growth stage.", "Rank each group by headcount growth.", "Build a market-map table and summarise the landscape."],
    outputFormat: "Table grouped by stage + landscape summary",
  }),
  s({
    slug: "thesis-screen",
    name: "Thesis screen",
    description: "Sweep the database for companies that match your thesis, ranked by momentum.",
    inputs: [{ name: "thesis", label: "Thesis (blank = your personalization)", kind: "text" }],
    steps: ["Turn the thesis (or the personalization thesis) into a search.", "Rank results by headcount growth.", "Show the top matches in a table.", "Offer to save the search with alerts or the companies to a list."],
    outputFormat: "Ranked table + why each fits",
  }),
  s({
    slug: "weekly-brief",
    name: "Weekly brief",
    description: "Monday market update: notable rounds, major news, top talent moves, and new results in your saved searches.",
    inputs: [],
    steps: ["Read funding rounds announced in the last 7 days.", "Read major news from the last 7 days.", "Read the highest-scoring talent signals.", "Read new results in saved searches.", "Write the brief."],
    outputFormat: "## Rounds · ## News · ## Talent · ## Your searches",
  }),
  s({
    slug: "stealth-radar",
    name: "Stealth radar",
    description: "Founders leaving to start something new and companies coming out of stealth.",
    inputs: [{ name: "focus", label: "Focus (optional, e.g. ex-fintech operators)", kind: "text" }],
    steps: ["Search talent signals of type new company and out of stealth, highest score first.", "Summarise who they are and where they came from.", "Offer to save the people to a list."],
    outputFormat: "Table + short notes",
  }),
  s({
    slug: "portfolio-pulse",
    name: "Portfolio pulse",
    description: "What changed across a list (e.g. My CRM or portfolio): news, talent moves, headcount trends.",
    inputs: [{ name: "list", label: "List", kind: "list" }],
    steps: ["Read the list.", "Rank its companies by recent momentum.", "Flag companies with new news or talent signals.", "Resurface stale records that have new signals."],
    outputFormat: "Table + flagged changes",
  }),
  s({
    slug: "warm-intro-paths",
    name: "Warm intro paths",
    description: "Ways in to a person or company: team connections (Release 3), shared investors and former colleagues.",
    inputs: [{ name: "target", label: "Person or company", kind: "person" }],
    steps: ["Read the target's profile.", "Check team network connections.", "Find shared investors and former colleagues from career history.", "Rank the paths and draft an intro request."],
    outputFormat: "Ranked paths + draft intro email",
  }),
  s({
    slug: "lp-update-pull",
    name: "LP update pull",
    description: "Pull the numbers for an LP update across a list of portfolio companies.",
    inputs: [{ name: "list", label: "Portfolio list", kind: "list" }],
    steps: ["Read the list.", "For each company read headcount, growth, funding and estimated revenue.", "Build a deck-ready table.", "Save it as a CSV."],
    outputFormat: "Deck-ready table + CSV",
  }),
];

export const CURATED_BY_SLUG = new Map(CURATED_SKILLS.map((k) => [k.slug, k]));

/** System-prompt block for a skill run (plan 10.2: execution = system prompt with steps). */
export function skillPrompt(k: Pick<Skill, "name" | "slug" | "steps" | "outputFormat">, input: string): string {
  return [
    `The user is running the skill /${k.slug} ("${k.name}"). Follow these steps in order, using tools for every fact:`,
    ...k.steps.map((st, n) => `${n + 1}. ${st}`),
    k.outputFormat ? `Output format: ${k.outputFormat}` : "",
    input ? `Skill input: ${input}` : "",
  ].filter(Boolean).join("\n");
}
