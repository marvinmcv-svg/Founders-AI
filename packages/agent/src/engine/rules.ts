/**
 * Rules engine: the deterministic agent used when Claude is unavailable (D-025) and as the
 * reference for evals. It maps the request (skill, mentions, keywords) to a fixed tool plan run
 * through the same recorder as the Claude engine, and writes the answer from tool data only, so
 * every number carries a source chip and passes the guard by construction.
 */
import type { AgentPending } from "@founders/core/repo";
import type { AgentInstructions } from "@founders/core/repo";
import { chip, day, num, pct, usd } from "../fmt";
import type { Mention } from "../mentions";
import type { TurnRecorder } from "../recorder";
import type { Skill } from "../skills";
import type { ToolResult } from "../types";

type Obj = Record<string, unknown>;
const o = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const a = (v: unknown): Obj[] => (Array.isArray(v) ? (v as Obj[]) : []);
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export type RulesRequest = {
  text: string;
  mentions: Mention[];
  skill: Pick<Skill, "slug" | "name" | "steps"> | null;
  skillInput: string;
  instructions: AgentInstructions;
  contextEntityId: string | null;
};

export type EngineOutput = { text: string; pending?: AgentPending; title?: string };

class Paused extends Error {
  constructor(public pending: AgentPending, public partial: string) {
    super("paused");
  }
}

/* ---------------- plan helpers ---------------- */

async function run(rec: TurnRecorder, name: string, input: Obj): Promise<ToolResult | null> {
  const r = await rec.call(name, input);
  if (r.kind === "ok") return r.result;
  if (r.kind === "pending") throw new Paused(r.pending, "");
  return null;
}

const cond = (field: string, operator: string, value?: unknown) => ({ kind: "condition", field, operator, ...(value === undefined ? {} : { value }) });
const group = (...children: Obj[]) => ({ kind: "group", op: "AND", children });

function rowsOf(r: ToolResult | null): Obj[] {
  return a(o(r?.data).rows);
}

/** `headcount_surge` → "Headcount surge", `NEW_COMPANY` → "New company". */
const humanize = (s: string) => (/^[A-Za-z0-9]+(_[A-Za-z0-9]+)+$/.test(s) ? s.replace(/_/g, " ").toLowerCase().replace(/^./, (x) => x.toUpperCase()) : s);

const nameChip = (row: Obj, nameKey = "name", idKey = "id") => `**${str(row[nameKey])}** ${chip(str(row[idKey]))}`;

/* ---------------- intent ---------------- */

type Intent =
  | "company-brief" | "diligence-brief" | "founder-check" | "fund-intel" | "competitor-map" | "market-map" | "thesis-screen"
  | "weekly-brief" | "stealth-radar" | "portfolio-pulse" | "warm-intro-paths" | "lp-update-pull"
  | "financials" | "company-news" | "team" | "compare" | "outreach" | "talent" | "rounds" | "news" | "hiring" | "saved-search" | "search";

const has = (t: string, re: RegExp) => re.test(t.toLowerCase());

export function classify(text: string, entities: { companies: string[]; people: string[]; investors: string[]; lists: string[]; searches: string[] }, skillSlug: string | null): Intent {
  const known: Intent[] = ["company-brief", "diligence-brief", "founder-check", "fund-intel", "competitor-map", "market-map", "thesis-screen", "weekly-brief", "stealth-radar", "portfolio-pulse", "warm-intro-paths", "lp-update-pull"];
  if (skillSlug && (known as string[]).includes(skillSlug)) return skillSlug as Intent;
  const t = text;
  if (entities.searches.length) return "saved-search";
  if (entities.lists.length) {
    if (has(t, /\blp\b|deck|numbers|table|csv|export/)) return "lp-update-pull";
    return "portfolio-pulse";
  }
  if (entities.companies.length >= 2 && has(t, /compar|vs\.?|versus|head.to.head|against/)) return "compare";
  if (entities.companies.length) {
    if (has(t, /memo|diligence|deep dive/)) return "diligence-brief";
    if (has(t, /competitor|rival|similar|look.?alike|landscape|peers/)) return "competitor-map";
    if (has(t, /revenue|valuation|financial|worth|\barr\b|estimate/)) return "financials";
    if (has(t, /\bnews\b|announce|press/)) return "company-news";
    if (has(t, /team|founder|hire|hiring|executive|people/)) return "team";
    return "company-brief";
  }
  if (entities.people.length) {
    if (has(t, /intro|warm|connect|who knows/)) return "warm-intro-paths";
    if (has(t, /email|outreach|reach out|message|draft/)) return "outreach";
    return "founder-check";
  }
  if (entities.investors.length) return "fund-intel";
  if (has(t, /weekly|monday|this week|market update|what happened/)) return "weekly-brief";
  if (has(t, /stealth|spin.?out|alumni|left to (start|found)|new compan|starting (something|a company)/)) return "stealth-radar";
  if (has(t, /market map|map the|landscape|segment/)) return "market-map";
  if (has(t, /thesis|match(es)? (my|our)|fit (my|our)/)) return "thesis-screen";
  if (has(t, /hiring surge|hiring fast|headcount (growth|surge)|growing (headcount|team)|fastest.growing/)) return "hiring";
  if (has(t, /\bhire|hires|hiring|departure|depart|exec(utive)? move|talent|joined|promot|left\b/)) return "talent";
  if (has(t, /\brounds?\b|raised|funding|financing|series [a-e]|seed round/)) return "rounds";
  if (has(t, /\bnews\b|headline|announcement/)) return "news";
  return "search";
}

/* ---------------- entity resolution ---------------- */

async function resolve(rec: TurnRecorder, req: RulesRequest) {
  const ids = req.mentions.filter((m) => m.kind === "entity").map((m) => m.id);
  if (req.contextEntityId && !ids.length) ids.push(req.contextEntityId);
  if (!ids.length && /[A-Z]/.test(req.text + req.skillInput)) {
    const r = await run(rec, "resolve_entities", { text: `${req.skillInput} ${req.text}`.trim().slice(0, 5000) });
    for (const e of a(o(r?.data).entities)) if (Number(e.confidence) >= 0.7) ids.push(str(e.id));
  }
  return {
    companies: ids.filter((x) => x.startsWith("com_")),
    people: ids.filter((x) => x.startsWith("per_")),
    investors: ids.filter((x) => x.startsWith("inv_")),
    lists: req.mentions.filter((m) => m.kind === "list").map((m) => m.id),
    searches: req.mentions.filter((m) => m.kind === "search").map((m) => m.id),
  };
}

/* ---------------- writers ---------------- */

function companySnapshot(c: Obj): string[] {
  const id = str(c.id);
  const lines = [`### ${str(c.name)} ${chip(id)}`];
  if (c.tagline || c.description) lines.push(str(c.tagline || c.description));
  const facts = [
    c.growth_stage ? `Stage: ${str(c.growth_stage)}` : "",
    c.hq_country ? `HQ: ${[c.hq_city, c.hq_country].filter(Boolean).map(str).join(", ")}` : "",
    c.founded_year ? `Founded: ${str(c.founded_year)}` : "",
    c.employee_count !== undefined ? `Employees: ${num(c.employee_count)}${c.headcount_growth_3m !== undefined ? ` (${pct(c.headcount_growth_3m)} in 3 months)` : ""}` : "",
    c.total_funding_usd !== undefined ? `Total raised: ${usd(c.total_funding_usd)}${c.last_funding_type ? `, last ${str(c.last_funding_type)} on ${day(c.last_funding_date)}` : ""}` : "",
    c.rank !== undefined ? `Rank: ${num(c.rank)}` : "",
  ].filter(Boolean);
  if (facts.length) lines.push(facts.map((f) => `- ${f} ${chip(id)}`).join("\n"));
  const hl = Array.isArray(c.highlights) ? (c.highlights as unknown[]).map((h) => humanize(str(h))).slice(0, 5) : [];
  if (hl.length) lines.push(`Highlights: ${hl.join(" · ")} ${chip(id)}`);
  return lines;
}

function financialLines(f: Obj, companyId: string): string[] {
  const e = o(f.latest_estimate);
  const out: string[] = [];
  if (Object.keys(e).length) {
    out.push(`- Estimated revenue (${day(e.month).slice(0, 7)}): ${usd(e.revenue_p50)} (range ${usd(e.revenue_p10)}–${usd(e.revenue_p90)}, ${str(e.confidence ?? "n/a")} confidence, model ${str(e.model_version)}) ${chip(companyId)}`);
    if (e.valuation_p50 !== undefined) out.push(`- Estimated valuation: ${usd(e.valuation_p50)} (range ${usd(e.valuation_p10)}–${usd(e.valuation_p90)}) ${chip(companyId)}`);
    if (f.revenue_growth_12m !== null && f.revenue_growth_12m !== undefined) out.push(`- Estimated revenue growth over 12 months: ${pct(f.revenue_growth_12m)} ${chip(companyId)}`);
    const drivers = a(e.drivers).slice(0, 3).map((d) => str(d.label ?? d.feature ?? d.name)).filter(Boolean);
    if (drivers.length) out.push(`- Main drivers of the estimate: ${drivers.join(", ")} ${chip(companyId)}`);
  } else out.push(`- No revenue estimate yet ${chip(companyId)}`);
  for (const d of a(f.disclosures).slice(-2)) out.push(`- Reported ${str(d.type)} revenue for ${day(d.period)}: ${usd(d.amount_usd)}${d.publisher ? ` (${str(d.publisher)})` : ""} ${chip(companyId)}`);
  const rounds = a(f.rounds);
  if (rounds.length) out.push(`- Rounds: ${rounds.slice(0, 4).map((r) => `${str(r.type)} ${usd(r.amount_usd)} (${day(r.announced_date)}) ${chip(str(r.id))}`).join("; ")}`);
  return out;
}

function tableLines(rows: Obj[], cols: [string, string, (r: Obj) => string][], max = 10): string[] {
  if (!rows.length) return [];
  return [
    `| ${cols.map((c) => c[1]).join(" | ")} |`,
    `| ${cols.map(() => "---").join(" | ")} |`,
    ...rows.slice(0, max).map((r) => `| ${cols.map((c) => c[2](r).replace(/\|/g, "/")).join(" | ")} |`),
  ];
}

const companyCols: [string, string, (r: Obj) => string][] = [
  ["name", "Company", (r) => nameChip(r)],
  ["growth_stage", "Stage", (r) => str(r.growth_stage) || "n/a"],
  ["hq_country", "HQ", (r) => str(r.hq_country) || "n/a"],
  ["employee_count", "Employees", (r) => num(r.employee_count)],
  ["headcount_growth_3m", "Headcount (3 mo)", (r) => pct(r.headcount_growth_3m)],
  ["total_funding_usd", "Raised", (r) => usd(r.total_funding_usd)],
];

/* ---------------- plans ---------------- */

async function companyBrief(rec: TurnRecorder, id: string, deep: boolean): Promise<EngineOutput> {
  const profile = await run(rec, "get_company", { company_id: id });
  if (!profile) return { text: "I couldn't read that company's profile." };
  const c = o(profile.data);
  const [fin, team, news, comp] = [await run(rec, "company_financials", { company_id: id }), await run(rec, "company_team", { company_id: id }), await run(rec, "company_news", { company_id: id, limit: 5 }), await run(rec, "company_competitors", { company_id: id, limit: deep ? 8 : 5 })];
  const out = [...companySnapshot(c)];
  out.push("", "## Funding & financials", ...financialLines(o(fin?.data), id));
  const investors = a(c.investors);
  if (investors.length) out.push(`- Investors: ${investors.slice(0, 6).map((x) => `${str(x.name)}${x.is_lead ? " (lead)" : ""} ${chip(str(x.id))}`).join(", ")}`);
  const people = a(o(team?.data).people);
  const founders = people.filter((p) => p.is_founder);
  out.push("", "## Team");
  out.push(founders.length ? founders.slice(0, 4).map((p) => `- ${str(p.full_name)}, ${str(p.current_title)} ${chip(str(p.id))}`).join("\n") : "- No founders listed.");
  const moves = a(o(team?.data).talent_signals);
  if (moves.length) out.push(...moves.slice(0, 3).map((m) => `- Talent signal: ${str(m.summary)} (score ${str(m.score)}, ${day(m.signal_date)}) ${chip(str(m.id))}`));
  const n = a(o(news?.data).news);
  out.push("", "## News", ...(n.length ? n.slice(0, deep ? 5 : 3).map((x) => `- ${day(x.published_at)} · ${str(x.title)} (${str(x.category)}, score ${str(x.score)}) ${chip(str(x.id))}`) : ["- No recent news signals."]));
  const cs = a(o(comp?.data).competitors);
  out.push("", "## Competitors", ...(cs.length ? cs.slice(0, 5).map((x) => `- ${nameChip(x)} — overlap ${str(x.overlap_score)}/10${x.reason ? `: ${str(x.reason)}` : ""}`) : ["- No competitors mapped yet."]));
  if (deep) {
    const peers = cs.filter((x) => x.headcount_growth_3m !== undefined);
    const faster = peers.filter((x) => Number(x.headcount_growth_3m) > Number(c.headcount_growth_3m ?? 0));
    out.push("", "## Versus peers", `- ${String(faster.length)} of ${String(peers.length)} mapped competitors are growing headcount faster over 3 months ${chip(id)}`);
    const risks: string[] = [];
    if (Number(c.headcount_growth_3m ?? 0) <= 0) risks.push(`Headcount is flat or shrinking (${pct(c.headcount_growth_3m)} in 3 months) ${chip(id)}`);
    if (!c.last_funding_date || str(c.last_funding_date) < new Date(Date.now() - 2 * 365 * 864e5).toISOString().slice(0, 10)) risks.push(`No round in the last two years (last: ${day(c.last_funding_date)}) ${chip(id)}`);
    if (investors.length <= 1) risks.push(`Concentrated cap table: ${String(investors.length)} known investor(s) ${chip(id)}`);
    out.push("", "## Risks", ...(risks.length ? risks.map((r) => `- ${r}`) : ["- Nothing stands out in the data."]));
    out.push("", "## Questions for the founders", "- What is the revenue mix and how close is the estimate?", "- What drives the current hiring plan?", "- Who are you losing deals to, and why?");
    const memo = out.join("\n");
    await run(rec, "save_memo", { title: `Diligence brief — ${str(c.name)}`, markdown: memo });
    return { text: `${memo}\n\nSaved as a memo artifact.`, title: `Diligence: ${str(c.name)}` };
  }
  return { text: out.join("\n"), title: `Brief: ${str(c.name)}` };
}

async function financials(rec: TurnRecorder, id: string): Promise<EngineOutput> {
  const profile = await run(rec, "get_company", { company_id: id });
  const fin = await run(rec, "company_financials", { company_id: id });
  const comp = await run(rec, "company_competitors", { company_id: id, limit: 5 });
  const c = o(profile?.data);
  const out = [`### ${str(c.name)} ${chip(id)} — revenue and valuation`, ...financialLines(o(fin?.data), id)];
  const peers = a(o(comp?.data).competitors).filter((x) => x.est_revenue_usd !== undefined);
  if (peers.length) out.push("", "**Peers (estimated revenue):**", ...peers.map((x) => `- ${nameChip(x)}: ${usd(x.est_revenue_usd)}`));
  out.push("", "_Estimates are model outputs with a P10–P90 range, not reported figures._");
  return { text: out.join("\n"), title: `Financials: ${str(c.name)}` };
}

async function competitorMap(rec: TurnRecorder, id: string): Promise<EngineOutput> {
  const profile = await run(rec, "get_company", { company_id: id });
  const comp = await run(rec, "company_competitors", { company_id: id, limit: 10 });
  const c = o(profile?.data);
  const cs = a(o(comp?.data).competitors);
  const all = [c, ...cs];
  const out = [`### Competitive map: ${str(c.name)} ${chip(id)}`, ""];
  out.push(...tableLines(all, [...companyCols, ["overlap_score", "Overlap", (r) => (r.overlap_score === undefined ? "—" : `${str(r.overlap_score)}/10`)]], 11));
  const ranked = [...cs].filter((x) => x.headcount_growth_3m !== undefined).sort((x, y) => Number(y.headcount_growth_3m) - Number(x.headcount_growth_3m));
  if (ranked[0]) out.push("", `Fastest-growing competitor: ${nameChip(ranked[0])} at ${pct(ranked[0].headcount_growth_3m)} headcount over 3 months.`);
  const funded = [...cs].sort((x, y) => Number(y.total_funding_usd ?? 0) - Number(x.total_funding_usd ?? 0))[0];
  if (funded) out.push(`Best-funded competitor: ${nameChip(funded)} with ${usd(funded.total_funding_usd)} raised.`);
  return { text: out.join("\n"), title: `Competitors: ${str(c.name)}` };
}

async function compare(rec: TurnRecorder, ids: string[]): Promise<EngineOutput> {
  const rows: Obj[] = [];
  for (const id of ids.slice(0, 4)) {
    const p = await run(rec, "get_company", { company_id: id });
    const f = await run(rec, "company_financials", { company_id: id });
    if (p) rows.push({ ...o(p.data), est_rev: o(o(f?.data).latest_estimate).revenue_p50 });
  }
  await run(rec, "create_table", { title: "Head to head", product: "companies", columns: [{ key: "name", label: "Company" }, { key: "growth_stage", label: "Stage" }, { key: "employee_count", label: "Employees" }, { key: "headcount_growth_3m", label: "Headcount (3 mo)" }, { key: "total_funding_usd", label: "Raised" }, { key: "est_rev", label: "Est. revenue" }], rows: rows.map((r) => ({ id: str(r.id), name: str(r.name), growth_stage: str(r.growth_stage), employee_count: Number(r.employee_count ?? 0), headcount_growth_3m: Number(r.headcount_growth_3m ?? 0), total_funding_usd: Number(r.total_funding_usd ?? 0), est_rev: r.est_rev === undefined ? null : Number(r.est_rev) })) });
  const out = ["### Head to head", "", ...tableLines(rows, [...companyCols, ["est_rev", "Est. revenue", (r) => usd(r.est_rev)]])];
  const lead = [...rows].sort((x, y) => Number(y.headcount_growth_3m ?? 0) - Number(x.headcount_growth_3m ?? 0))[0];
  if (lead) out.push("", `${nameChip(lead)} has the strongest 3-month headcount growth (${pct(lead.headcount_growth_3m)}).`);
  return { text: out.join("\n"), title: "Head to head" };
}

async function founderCheck(rec: TurnRecorder, id: string): Promise<EngineOutput> {
  const r = await run(rec, "get_person", { person_id: id });
  const p = o(r?.data);
  if (!r) return { text: "I couldn't read that person's profile." };
  const out = [`### ${str(p.full_name)} ${chip(id)}`, `${str(p.current_title)}${p.current_company_name ? ` at ${str(p.current_company_name)} ${p.current_company_id ? chip(str(p.current_company_id)) : ""}` : ""}`];
  if (p.years_experience !== undefined) out.push(`- ${num(p.years_experience)} years of experience ${chip(id)}`);
  if (p.location) out.push(`- Based in ${str(p.location)} ${chip(id)}`);
  const hl = (Array.isArray(p.highlights) ? p.highlights : []).map((h) => humanize(str(h)));
  if (hl.length) out.push(`- Highlights: ${hl.join(" · ")} ${chip(id)}`);
  const exp = a(p.experience);
  out.push("", "## Career", ...(exp.length ? exp.map((e) => `- ${str(e.title)} at ${str(e.company_name)} (${day(e.start).slice(0, 7)} – ${e.is_current ? "present" : day(e.end).slice(0, 7)})${e.company_id ? ` ${chip(str(e.company_id))}` : ""}`) : ["- No career history on file."]));
  const edu = a(p.education);
  if (edu.length) out.push("", "## Education", ...edu.map((e) => `- ${str(e.school_name)}${e.degree ? `, ${str(e.degree)}` : ""}${e.field ? ` in ${str(e.field)}` : ""} ${chip(id)}`));
  const sig = a(p.talent_signals);
  out.push("", "## Talent signals", ...(sig.length ? sig.map((s) => `- ${day(s.signal_date)} · ${str(s.summary)} (score ${str(s.score)}) ${chip(str(s.id))}`) : ["- None."]));
  return { text: out.join("\n"), title: `Founder check: ${str(p.full_name)}` };
}

async function fundIntel(rec: TurnRecorder, id: string): Promise<EngineOutput> {
  const r = await run(rec, "get_investor", { investor_id: id });
  const v = o(r?.data);
  if (!r) return { text: "I couldn't read that investor's profile." };
  const out = [`### ${str(v.name)} ${chip(id)}`, `${str(v.type)}${v.hq_country ? ` · ${str(v.hq_country)}` : ""}`];
  if (v.aum_usd !== undefined) out.push(`- AUM: ${usd(v.aum_usd)} ${chip(id)}`);
  if (v.check_min !== undefined) out.push(`- Check size: ${usd(v.check_min)}–${usd(v.check_max)} ${chip(id)}`);
  out.push(`- ${num(v.investments_count)} investments, ${num(v.leads_count)} as lead, ${num(v.exits_count)} exits ${chip(id)}`);
  const mix = a(v.stage_mix);
  if (mix.length) out.push(`- Stage mix: ${mix.slice(0, 5).map((m) => `${str(m.type)} ${num(m.n)}`).join(", ")} ${chip(id)}`);
  const port = a(v.recent_portfolio);
  out.push("", "## Recent portfolio", ...(port.length ? port.slice(0, 8).map((c) => `- ${nameChip(c)} · ${str(c.growth_stage)} · first invested ${day(c.first_invested)}${c.is_lead ? " (lead)" : ""}`) : ["- None on file."]));
  const co = a(v.co_investors);
  if (co.length) out.push("", "## Top co-investors", ...co.map((c) => `- ${nameChip(c)} — ${num(c.shared_rounds)} shared rounds`));
  return { text: out.join("\n"), title: `Fund intel: ${str(v.name)}` };
}

async function searchPlan(rec: TurnRecorder, input: Obj, heading: string, cols: [string, string, (r: Obj) => string][]): Promise<{ text: string; rows: Obj[] }> {
  const r = await run(rec, "search_entities", input);
  const d = o(r?.data);
  const rows = rowsOf(r);
  if (!rows.length) return { text: `### ${heading}\n\nNo matches. Try widening the criteria.`, rows };
  return { text: [`### ${heading}`, d.explanation ? `_${str(d.explanation)}_` : "", `${num(d.total)}${d.total_capped ? "+" : ""} match(es); top ${num(rows.length)} below.`, "", ...tableLines(rows, cols, 15)].filter((x) => x !== "").join("\n"), rows };
}

const talentCols: [string, string, (r: Obj) => string][] = [
  ["person_name", "Person", (r) => nameChip(r, "person_name", "person_id")],
  ["type", "Signal", (r) => `${humanize(str(r.type))} ${chip(str(r.id))}`],
  ["score", "Score", (r) => str(r.score)],
  ["current_company_name", "Company", (r) => str(r.current_company_name) || "—"],
  ["signal_date", "Date", (r) => day(r.signal_date)],
];
const roundCols: [string, string, (r: Obj) => string][] = [
  ["company_name", "Company", (r) => nameChip(r, "company_name", "company_id")],
  ["type", "Round", (r) => `${str(r.type)} ${chip(str(r.id))}`],
  ["amount_usd", "Amount", (r) => usd(r.amount_usd)],
  ["announced_date", "Date", (r) => day(r.announced_date)],
];
const newsCols: [string, string, (r: Obj) => string][] = [
  ["company_name", "Company", (r) => nameChip(r, "company_name", "company_id")],
  ["title", "Headline", (r) => `${str(r.title)} ${chip(str(r.id))}`],
  ["category", "Category", (r) => humanize(str(r.category))],
  ["published_at", "Published", (r) => day(r.published_at)],
];

async function weeklyBrief(rec: TurnRecorder): Promise<EngineOutput> {
  const out = ["## Weekly brief"];
  let rounds = await searchPlan(rec, { product: "funding_rounds", filter: group(cond("announced_date", "within_last_days", 7)), sort: { field: "amount_usd", dir: "desc" }, limit: 10 }, "Rounds announced in the last 7 days", roundCols);
  if (!rounds.rows.length) rounds = await searchPlan(rec, { product: "funding_rounds", filter: group(cond("announced_date", "within_last_days", 30)), sort: { field: "amount_usd", dir: "desc" }, limit: 10 }, "Largest rounds of the last 30 days", roundCols);
  out.push(rounds.text);
  out.push((await searchPlan(rec, { product: "news_signals", filter: group(cond("is_major", "is_true"), cond("published_at", "within_last_days", 7)), sort: { field: "score", dir: "desc" }, limit: 8 }, "Major news this week", newsCols)).text);
  out.push((await searchPlan(rec, { product: "talent_signals", filter: group(cond("signal_date", "within_last_days", 7)), sort: { field: "score", dir: "desc" }, limit: 8 }, "Top talent moves", talentCols)).text);
  const ws = await run(rec, "my_workspace", {});
  const searches = a(o(ws?.data).saved_searches).filter((s) => Number(s.new_results ?? 0) > 0);
  out.push("### Your saved searches", ...(searches.length ? searches.map((s) => `- ${str(s.name)}: ${num(s.new_results)} new result(s) ${chip(str(s.id))}`) : ["- No new results since you last looked."]));
  return { text: out.join("\n\n"), title: `Weekly brief ${new Date().toISOString().slice(0, 10)}` };
}

async function listPlan(rec: TurnRecorder, listId: string, mode: "pulse" | "lp"): Promise<EngineOutput> {
  const r = await run(rec, "list_items", { list_id: listId });
  if (!r) return { text: "I can't find that list in your workspace." };
  const d = o(r?.data);
  const rows = rowsOf(r);
  const listName = str(d.list);
  if (!rows.length) return { text: `"${listName}" ${chip(listId)} has no records yet.` };
  const isCompany = str(d.product) === "companies";
  if (mode === "lp" && isCompany) {
    await run(rec, "export_csv", { title: `${listName} — LP update`, columns: ["Company", "Stage", "Employees", "Headcount (3 mo)", "Raised (USD)", "Est. revenue (USD)"], rows: rows.map((x) => [str(x.name), str(x.growth_stage), Number(x.employee_count ?? 0), x.headcount_growth_3m === undefined ? null : Number(x.headcount_growth_3m), Number(x.total_funding_usd ?? 0), x.est_revenue_usd === undefined ? null : Number(x.est_revenue_usd)]) });
    return { text: [`### LP update numbers: ${listName} ${chip(listId)}`, "", ...tableLines(rows, [...companyCols, ["est_revenue_usd", "Est. revenue", (x) => usd(x.est_revenue_usd)]], 25), "", "Saved as a CSV artifact."].join("\n"), title: `LP update: ${listName}` };
  }
  if (!isCompany) return { text: [`### ${listName} ${chip(listId)}`, `${num(d.total)} record(s).`].join("\n") };
  const ranked = [...rows].sort((x, y) => Number(y.headcount_growth_3m ?? -9) - Number(x.headcount_growth_3m ?? -9));
  const out = [`### Pulse: ${listName} ${chip(listId)}`, `${num(d.total)} companies, ranked by 3-month headcount growth.`, "", ...tableLines(ranked, companyCols, 15)];
  const news = await run(rec, "search_entities", { product: "news_signals", filter: group(cond("company_list", "in_list", listId), cond("published_at", "within_last_days", 30)), sort: { field: "score", dir: "desc" }, limit: 10 });
  const nrows = rowsOf(news);
  out.push("", "**New signals in the last 30 days** (resurface these):", ...(nrows.length ? nrows.map((n) => `- ${nameChip(n, "company_name", "company_id")}: ${str(n.title)} (${str(n.category)}, ${day(n.published_at)}) ${chip(str(n.id))}`) : ["- No news on these companies in the last 30 days."]));
  const shrinking = ranked.filter((x) => x.headcount_growth_3m !== undefined && Number(x.headcount_growth_3m) < 0);
  if (shrinking.length) out.push("", `**Watch:** ${shrinking.slice(0, 5).map((x) => `${nameChip(x)} (${pct(x.headcount_growth_3m)})`).join(", ")}`);
  return { text: out.join("\n"), title: `Pulse: ${listName}` };
}

async function warmIntro(rec: TurnRecorder, id: string, draft: boolean): Promise<EngineOutput> {
  const r = await run(rec, "get_person", { person_id: id });
  const p = o(r?.data);
  if (!r) return { text: "I couldn't read that person's profile." };
  const out = [`### Ways in to ${str(p.full_name)} ${chip(id)}`];
  const net = await run(rec, "network_connections", { person_id: id });
  const mates = a(o(net?.data).teammates);
  out.push(
    `1. **Team network:** ${
      mates.length
        ? mates.slice(0, 3).map((t) => `${str(t.name)} (${str(t.label)}, strength ${str(t.strength)})`).join(", ") + ` — ask ${str(mates[0]?.name)} first.`
        : str(o(net?.data).reason ?? "not connected")
    }`,
  );
  const exp = a(p.experience).filter((e) => !e.is_current && e.company_id);
  out.push(`2. **Former colleagues:** people who overlapped at ${exp.length ? exp.slice(0, 3).map((e) => `${str(e.company_name)} ${chip(str(e.company_id))}`).join(", ") : "their previous companies"} — open those companies' team pages to find them.`);
  if (p.current_company_id) {
    const co = await run(rec, "get_company", { company_id: str(p.current_company_id) });
    const inv = a(o(co?.data).investors);
    out.push(`3. **Shared investors:** ${inv.length ? inv.slice(0, 4).map((x) => `${str(x.name)} ${chip(str(x.id))}`).join(", ") : "none on file"} back ${str(p.current_company_name)} — ask whoever in your network knows them.`);
  }
  if (draft) {
    const body = `Hi,\n\nCould you introduce me to ${str(p.full_name)} (${str(p.current_title)}${p.current_company_name ? ` at ${str(p.current_company_name)}` : ""})? I'd like to learn more about what they're building.\n\nThanks!`;
    await run(rec, "draft_email", { to_person_id: id, subject: `Intro to ${str(p.full_name)}?`, body });
    out.push("", "I drafted an intro request (saved as an email artifact, not sent).");
  }
  return { text: out.join("\n"), title: `Intro paths: ${str(p.full_name)}` };
}

async function outreach(rec: TurnRecorder, id: string): Promise<EngineOutput> {
  const r = await run(rec, "get_person", { person_id: id });
  const p = o(r?.data);
  if (!r) return { text: "I couldn't read that person's profile." };
  const first = str(p.full_name).split(" ")[0] ?? "";
  const hook = a(p.talent_signals)[0];
  const body = [`Hi ${first},`, "", hook ? `I saw the news: ${str(hook.summary)}. Congratulations.` : `I've been following your work${p.current_company_name ? ` at ${str(p.current_company_name)}` : ""}.`, "We back founders early and would love to compare notes on what you're seeing. Would you have time for a short call next week?", "", "Best,"].join("\n");
  await run(rec, "draft_email", { to_person_id: id, subject: `Quick intro`, body });
  return { text: [`### Outreach draft for ${str(p.full_name)} ${chip(id)}`, "", "```", body, "```", "", "Saved as an email artifact (not sent)."].join("\n"), title: `Outreach: ${str(p.full_name)}` };
}

/* ---------------- entry ---------------- */

function thesisQuery(req: RulesRequest): string {
  const i = req.instructions;
  const parts = [req.skillInput || req.text.replace(/^\/[a-z-]+\s*/, ""), !req.skillInput && i.thesis ? i.thesis : "", ...(i.sectors ?? []), ...(i.stages ?? []), ...(i.geographies ?? []).map((g) => `in ${g}`)];
  return parts.filter(Boolean).join(" ").trim() || "fast-growing companies";
}

function wantsList(t: string) {
  return /\b(save|add|put)\b.*\b(to|in|into)\b.*\blist\b|\bcreate (a )?list\b|\bmake (a )?list\b/i.test(t);
}
function wantsSavedSearch(t: string) {
  return /\bsave (this|the|it as a)? ?search\b|\balert me\b|\bnotify me\b|\bkeep me posted\b/i.test(t);
}

/** The research part of a request, without trailing "…and save them to a list / alert me weekly" clauses. */
export function stripActions(text: string): string {
  return text
    .replace(/[,;]?\s*(and\s+|then\s+)?(save (this|the|it as a)? ?search|alert me|notify me|keep me posted|(save|add|put) (them|these|it|the results) (to|in|into)|create (a )?list|make (a )?list)\b[\s\S]*$/i, "")
    .trim();
}

export async function runRules(rec: TurnRecorder, original: RulesRequest): Promise<EngineOutput> {
  const req: RulesRequest = { ...original, text: stripActions(original.text) || original.text };
  let partial = "";
  try {
    const ents = await resolve(rec, req);
    const intent = classify(req.text, ents, req.skill?.slug ?? null);
    const company = ents.companies[0];
    const person = ents.people[0];
    const investor = ents.investors[0];
    let out: EngineOutput;
    let searchQuery = "";
    let searchProduct: string | undefined;
    let rows: Obj[] = [];
    let rowsProduct = "companies";
    const missing = (what: string) => ({ text: `Tell me which ${what} — type @ to pick one.` });
    switch (intent) {
      case "company-brief": out = company ? await companyBrief(rec, company, false) : missing("company"); break;
      case "diligence-brief": out = company ? await companyBrief(rec, company, true) : missing("company"); break;
      case "financials": out = company ? await financials(rec, company) : missing("company"); break;
      case "competitor-map": out = company ? await competitorMap(rec, company) : missing("company"); break;
      case "company-news": {
        if (!company) { out = missing("company"); break; }
        const r = await run(rec, "company_news", { company_id: company, limit: 10 });
        const d = o(r?.data);
        out = { text: [`### News: ${str(d.company)} ${chip(company)}`, ...a(d.news).map((x) => `- ${day(x.published_at)} · ${str(x.title)} — ${str(x.summary)} (${str(x.category)}, score ${str(x.score)}) ${chip(str(x.id))}`)].join("\n") };
        break;
      }
      case "team": {
        if (!company) { out = missing("company"); break; }
        const r = await run(rec, "company_team", { company_id: company });
        const d = o(r?.data);
        out = { text: [`### Team: ${str(d.company)} ${chip(company)}`, ...a(d.people).map((p) => `- ${str(p.full_name)}, ${str(p.current_title)}${p.is_founder ? " (founder)" : ""} ${chip(str(p.id))}`), "", "**Talent moves**", ...(a(d.talent_signals).length ? a(d.talent_signals).map((m) => `- ${day(m.signal_date)} · ${str(m.summary)} (score ${str(m.score)}) ${chip(str(m.id))}`) : ["- None recently."])].join("\n") };
        break;
      }
      case "compare": out = await compare(rec, ents.companies); break;
      case "founder-check": out = person ? await founderCheck(rec, person) : missing("person"); break;
      case "fund-intel": out = investor ? await fundIntel(rec, investor) : missing("investor"); break;
      case "warm-intro-paths": out = person ? await warmIntro(rec, person, true) : missing("person"); break;
      case "outreach": out = person ? await outreach(rec, person) : missing("person"); break;
      case "weekly-brief": out = await weeklyBrief(rec); break;
      case "portfolio-pulse": out = ents.lists[0] ? await listPlan(rec, ents.lists[0], "pulse") : missing("list (type # to pick one)"); break;
      case "lp-update-pull": out = ents.lists[0] ? await listPlan(rec, ents.lists[0], "lp") : missing("list (type # to pick one)"); break;
      case "saved-search": {
        const r = await run(rec, "saved_search_results", { search_id: ents.searches[0]!, new_only: /\bnew\b/i.test(req.text) });
        const d = o(r?.data);
        rows = rowsOf(r);
        rowsProduct = str(d.product);
        out = { text: [`### ${str(d.search)} ${chip(ents.searches[0]!)}`, `${num(d.total)} result(s).`, "", ...tableLines(rows, rowsProduct === "companies" ? companyCols : [["name", "Name", (x) => `${str(x.name ?? x.full_name ?? x.person_name ?? x.company_name)} ${chip(str(x.id))}`]], 15)].join("\n") };
        break;
      }
      case "stealth-radar": {
        const sp = await searchPlan(rec, { product: "talent_signals", filter: group(cond("type", "any_of", ["NEW_COMPANY", "OUT_OF_STEALTH"])), sort: { field: "score", dir: "desc" }, limit: 15 }, "Founders starting something new", talentCols);
        out = { text: sp.text, title: "Stealth radar" };
        rows = sp.rows; rowsProduct = "talent_signals";
        break;
      }
      case "talent": {
        const types = /depart|left\b|leav/i.test(req.text) ? ["DEPARTURE"] : /promot/i.test(req.text) ? ["PROMOTION"] : /hire|hiring|joined|new role|exec/i.test(req.text) ? ["NEW_ROLE", "PROMOTION"] : null;
        const sp = await searchPlan(rec, { product: "talent_signals", ...(types ? { filter: group(cond("type", "any_of", types), cond("signal_date", "within_last_days", 90)) } : { query: req.text }), sort: { field: "score", dir: "desc" }, limit: 15 }, "Talent moves", talentCols);
        out = { text: sp.text, title: "Talent moves" };
        rows = sp.rows; rowsProduct = "talent_signals";
        break;
      }
      case "rounds": {
        searchQuery = req.text; searchProduct = "funding_rounds";
        const sp = await searchPlan(rec, { product: "funding_rounds", query: req.text, sort: { field: "announced_date", dir: "desc" }, limit: 15 }, "Funding rounds", roundCols);
        out = { text: sp.text, title: "Funding rounds" };
        break;
      }
      case "news": {
        searchQuery = req.text; searchProduct = "news_signals";
        const sp = await searchPlan(rec, { product: "news_signals", query: req.text, sort: { field: "published_at", dir: "desc" }, limit: 15 }, "News", newsCols);
        out = { text: sp.text, title: "News" };
        break;
      }
      case "hiring": {
        searchQuery = req.text; searchProduct = "companies";
        const sp = await searchPlan(rec, { product: "companies", query: req.text, sort: { field: "headcount_growth_3m", dir: "desc" }, limit: 15 }, "Hiring fastest (3-month headcount growth)", companyCols);
        out = { text: sp.text, title: "Hiring surges" };
        rows = sp.rows;
        break;
      }
      case "market-map": {
        const q = req.skillInput || req.text.replace(/^\/[a-z-]+\s*/, "").replace(/\b(market map|map the|map of|landscape of|landscape)\b/gi, "").trim() || thesisQuery(req);
        searchQuery = q; searchProduct = "companies";
        const r = await run(rec, "search_entities", { product: "companies", query: q, sort: { field: "headcount_growth_3m", dir: "desc" }, limit: 25 });
        rows = rowsOf(r);
        const d = o(r?.data);
        const byStage = new Map<string, Obj[]>();
        for (const x of rows) byStage.set(str(x.growth_stage) || "Unknown", [...(byStage.get(str(x.growth_stage) || "Unknown") ?? []), x]);
        const parts = [`## Market map: ${q}`, d.explanation ? `_${str(d.explanation)}_` : "", `${num(d.total)}${d.total_capped ? "+" : ""} companies match; the ${num(rows.length)} with the strongest momentum, by stage:`];
        for (const [stage, xs] of byStage) parts.push("", `### ${stage}`, ...xs.map((x) => `- ${nameChip(x)} · ${str(x.hq_country)} · ${num(x.employee_count)} employees (${pct(x.headcount_growth_3m)}) · raised ${usd(x.total_funding_usd)}`));
        out = { text: parts.filter((p) => p !== "").join("\n"), title: `Market map: ${q}` };
        break;
      }
      case "thesis-screen":
      case "search":
      default: {
        const q = intent === "thesis-screen" ? thesisQuery(req) : req.text;
        searchQuery = q;
        const r = await run(rec, "search_entities", { query: q, ...(intent === "thesis-screen" ? { product: "companies", sort: { field: "headcount_growth_3m", dir: "desc" } } : {}), limit: 15 });
        const d = o(r?.data);
        rows = rowsOf(r);
        rowsProduct = str(d.product) || "companies";
        searchProduct = rowsProduct;
        const cols = rowsProduct === "companies" ? companyCols : rowsProduct === "people" ? ([["full_name", "Person", (x: Obj) => nameChip(x, "full_name")], ["current_title", "Title", (x: Obj) => str(x.current_title)], ["current_company_name", "Company", (x: Obj) => str(x.current_company_name)]] as [string, string, (r: Obj) => string][]) : rowsProduct === "investors" ? ([["name", "Investor", (x: Obj) => nameChip(x)], ["type", "Type", (x: Obj) => str(x.type)], ["investments_count", "Investments", (x: Obj) => num(x.investments_count)]] as [string, string, (r: Obj) => string][]) : rowsProduct === "funding_rounds" ? roundCols : rowsProduct === "talent_signals" ? talentCols : rowsProduct === "news_signals" ? newsCols : companyCols;
        out = {
          text: rows.length ? [`### ${intent === "thesis-screen" ? `Thesis screen: ${q}` : "Results"}`, d.explanation ? `_${str(d.explanation)}_` : "", `${num(d.total)}${d.total_capped ? "+" : ""} match(es); top ${num(rows.length)}:`, "", ...tableLines(rows, cols, 15)].filter((x) => x !== "").join("\n") : "No matches. Try different words, or open the grid and use the filter builder.",
          title: intent === "thesis-screen" ? "Thesis screen" : q.slice(0, 80),
        };
      }
    }
    partial = out.text;
    // Follow-up writes the user asked for in the same message (confirmation required).
    if (wantsList(original.text) && rows.length) {
      const entityKey = rowsProduct === "talent_signals" ? "person_id" : "id";
      const type = rowsProduct === "talent_signals" || rowsProduct === "people" ? "people" : rowsProduct === "investors" ? "investors" : "companies";
      const name = (out.title ?? "Agent list").slice(0, 80);
      await run(rec, "create_list", { name, type, entity_ids: rows.map((x) => str(x[entityKey])).filter(Boolean) });
    }
    if (wantsSavedSearch(original.text) && searchQuery) {
      await run(rec, "save_search", { name: searchQuery.slice(0, 80), query: searchQuery, ...(searchProduct ? { product: searchProduct } : {}), cadence: /real.?time|immediately|right away/i.test(original.text) ? "REALTIME" : /week/i.test(original.text) ? "WEEKLY" : "DAILY" });
    }
    return out;
  } catch (e) {
    if (e instanceof Paused) return { text: partial || "I need your confirmation before I continue.", pending: e.pending };
    throw e;
  }
}

/** Sentence appended after a confirmed write completes. */
export function confirmationText(result: ToolResult): string {
  return `\n\nDone: ${result.summary} ${result.sources.map((s) => chip(s.id)).join(" ")}`;
}
