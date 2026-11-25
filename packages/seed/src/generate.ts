/**
 * Synthetic seed dataset (plan 9.0). Deterministic: fixed seed → same universe (relative to the
 * anchor date). Plan sizes at scale 1: 50k companies, 250k people, 3k investors, 40k rounds,
 * 2k acquisitions, 300 IPOs, 30k talent signals, 20k news, 12 months of metrics, revenue
 * disclosures for 5% of companies. All names are invented. Output = rows per table for COPY.
 */
import { estimateV0, MODEL_VERSION } from "@founders/core/estimates";
import {
  BUSINESS_MODELS,
  DEPARTMENTS,
  ECOSYSTEMS,
  GEOGRAPHY,
  SECTOR_INDUSTRIES,
  SECTOR_NAMES,
  SECTOR_VERTICALS,
  TAXONOMY,
  taxonomySlug,
  verticalId,
} from "@founders/core/taxonomy";
import {
  ACQUIRERS,
  BIG_EMPLOYERS,
  CUSTOMER_PHRASES,
  DEGREES,
  EXCHANGES,
  FIELDS,
  FIRST_NAMES,
  INVESTOR_NAME_PARTS,
  LANG_BY_COUNTRY,
  LAST_NAMES,
  NAME_ENDINGS,
  NAME_ROOTS,
  NAME_SUFFIXES,
  PUBLISHERS,
  TAGLINE_TEMPLATES,
  TITLES_BY_DEPT,
  TLDS,
  UNIVERSITIES,
} from "./names";
import { addDays, addMonths, isoDate, monthStart, Rng } from "./random";

export type Cell = string | number | boolean | null | string[] | Record<string, unknown> | unknown[];
export type TableRows = { columns: string[]; rows: Cell[][] };

export type SeedOptions = { scale?: number; seed?: number; today?: Date };

const STAGES = ["Pre-seed / Seed", "Early", "Growth", "Late", "Exit / Public"] as const;
type Stage = (typeof STAGES)[number];

const ROUND_PATH: Record<Stage, string[]> = {
  "Pre-seed / Seed": ["Pre-seed", "Seed"],
  Early: ["Pre-seed", "Seed", "Series A"],
  Growth: ["Seed", "Series A", "Series B", "Series C"],
  Late: ["Seed", "Series A", "Series B", "Series C", "Series D", "Series E"],
  "Exit / Public": ["Seed", "Series A", "Series B", "Series C", "Series D"],
};

const ROUND_AMOUNT: Record<string, [number, number]> = {
  "Pre-seed": [100_000, 800_000],
  Seed: [500_000, 4_000_000],
  "Series A": [3_000_000, 20_000_000],
  "Series B": [15_000_000, 60_000_000],
  "Series C": [40_000_000, 150_000_000],
  "Series D": [80_000_000, 300_000_000],
  "Series E": [150_000_000, 500_000_000],
};

const ROUND_STAGE_FIT: Record<string, Stage> = {
  "Pre-seed": "Pre-seed / Seed",
  Seed: "Pre-seed / Seed",
  "Series A": "Early",
  "Series B": "Growth",
  "Series C": "Growth",
  "Series D": "Late",
  "Series E": "Late",
};

const EMPLOYEES: Record<Stage, [number, number]> = {
  "Pre-seed / Seed": [2, 18],
  Early: [10, 90],
  Growth: [50, 450],
  Late: [300, 3000],
  "Exit / Public": [800, 9000],
};

const FOUNDED: Record<Stage, [number, number]> = {
  "Pre-seed / Seed": [2021, 2026],
  Early: [2016, 2024],
  Growth: [2011, 2021],
  Late: [2004, 2017],
  "Exit / Public": [1999, 2015],
};

function employeeRange(n: number): string {
  if (n <= 10) return "1-10";
  if (n <= 50) return "11-50";
  if (n <= 200) return "51-200";
  if (n <= 500) return "201-500";
  if (n <= 1000) return "501-1000";
  if (n <= 5000) return "1001-5000";
  return "5001+";
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

type Company = {
  id: string;
  name: string;
  domain: string;
  tagline: string;
  description: string;
  foundedYear: number;
  city: string;
  country: string;
  region: string;
  stage: Stage;
  status: string;
  focus: string;
  models: string[];
  sector: string;
  sectorId: string;
  industryIds: string[];
  verticalIds: string[];
  verticalNames: string[];
  ecosystemIds: string[];
  employees: number[]; // 12 monthly values, oldest → newest
  web: number[];
  followers: number[];
  bootstrapped: boolean;
  rounds: { id: string; type: string; amount: number; date: Date; post: number; investorIds: string[] }[];
  investorIds: Set<string>;
  highlights: string[];
  rankScore: number;
  rank: number;
  signalCount: number;
  disclosure: { amount: number; month: number } | null;
  technologies: string[];
  certifications: string[];
  acquiredBy: string | null;
  ipo: boolean;
};

type Investor = {
  id: string;
  name: string;
  type: string;
  country: string;
  city: string;
  stages: string[];
  geographies: string[];
  sectors: string[];
  aum: number | null;
  checkMin: number;
  checkMax: number;
  founded: number;
  tier1: boolean;
  domain: string | null;
  portfolio: Map<string, number>; // companyId -> rounds participated
  leads: number;
};

const TECHNOLOGIES = ["React", "Node.js", "Python", "PostgreSQL", "AWS", "GCP", "Kubernetes", "Stripe", "Twilio", "Snowflake", "dbt", "Flutter", "Go", "Rust", "Salesforce", "HubSpot", "OpenAI API", "Claude API"];
const CERTS = ["SOC 2", "ISO 27001", "GDPR", "HIPAA", "B Corp", "PCI DSS"];

export function generate(opts: SeedOptions = {}) {
  const scale = opts.scale ?? 1;
  const rng = new Rng(opts.seed ?? 20261125);
  const today = opts.today ?? new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
  const n = (x: number) => Math.max(1, Math.round(x * scale));
  const id = (prefix: string) => `${prefix}_${rng.hex(24)}`;
  const thisMonth = monthStart(today);
  const months = Array.from({ length: 12 }, (_, i) => addMonths(thisMonth, i - 11));

  /* ---------------- taxonomy ---------------- */
  const taxonomyRows: Cell[][] = [];
  for (const s of TAXONOMY.sectors) taxonomyRows.push([s.id, "SECTOR", s.name, taxonomySlug(s.name), null, s.id]);
  for (const i of TAXONOMY.industries) taxonomyRows.push([i.id, "INDUSTRY", i.name, taxonomySlug(i.name), i.parentId ?? null, `${i.parentId}.${i.id}`]);
  for (const v of TAXONOMY.verticals) taxonomyRows.push([v.id, "TECH_VERTICAL", v.name, taxonomySlug(v.name), null, v.id]);
  for (const e of TAXONOMY.ecosystems) taxonomyRows.push([e.id, "ECOSYSTEM", e.name, taxonomySlug(e.name), null, e.id]);
  for (const m of BUSINESS_MODELS) taxonomyRows.push([`bm_${taxonomySlug(m)}`, "BUSINESS_MODEL", m, taxonomySlug(m), null, `bm_${taxonomySlug(m)}`]);

  /* ---------------- schools ---------------- */
  const schools = UNIVERSITIES.map((u) => ({ ...u, id: id("sch") }));
  const schoolRows: Cell[][] = schools.map((s) => [s.id, s.name, null, s.country, s.tier]);

  /* ---------------- investors ---------------- */
  const investors: Investor[] = [];
  const usedInvestorNames = new Set<string>();
  const middles = [" ", " Tech ", " Impact ", " Seed ", " Digital ", " Frontier "];
  const nInvestors = n(3000);
  const geoWeights = GEOGRAPHY.map((g) => g.weight);
  for (let i = 0; i < nInvestors; i++) {
    const type = rng.weighted(["VC", "PE", "CVC", "Angel", "Family office", "Accelerator"], [55, 8, 5, 25, 4, 3]);
    const geo = rng.weighted(GEOGRAPHY, geoWeights);
    let name = "";
    for (let tries = 0; tries < 20; tries++) {
      if (type === "Angel") {
        const lang = LANG_BY_COUNTRY[geo.country] ?? "en";
        name = `${rng.pick(FIRST_NAMES[lang] ?? [])} ${rng.pick(LAST_NAMES[lang] ?? [])}`;
      } else if (type === "CVC") name = `${rng.pick(BIG_EMPLOYERS)} Ventures`;
      else if (type === "Accelerator") name = `${rng.pick(INVESTOR_NAME_PARTS.first)} ${rng.pick(["Launchpad", "Accelerator", "Startup Lab", "Incubadora"])}`;
      else if (type === "Family office") name = `${rng.pick(LAST_NAMES.es ?? [])} ${rng.pick(["Family Office", "Holdings", "Inversiones"])}`;
      else name = `${rng.pick(INVESTOR_NAME_PARTS.first)}${rng.pick(middles)}${rng.pick(INVESTOR_NAME_PARTS.second)}`;
      if (!usedInvestorNames.has(name)) break;
      name = `${name} ${rng.pick(["II", "III", "Global", "Latam", "Opportunity"])}`;
      if (!usedInvestorNames.has(name)) break;
    }
    if (usedInvestorNames.has(name)) name = `${name} ${i}`;
    usedInvestorNames.add(name);
    const latam = geo.region === "Latin America";
    const stagePool = type === "PE" ? ["Growth", "Late"] : type === "Accelerator" || type === "Angel" ? ["Pre-seed / Seed"] : rng.pickN(STAGES.slice(0, 4), rng.int(1, 3));
    const aum = type === "Angel" || type === "Accelerator" ? null : Math.round(rng.logRange(latam ? 10e6 : 40e6, latam ? 400e6 : 3e9) / 1e6) * 1e6;
    const checkMin = type === "Angel" ? rng.int(5, 50) * 1000 : type === "PE" ? rng.int(10, 50) * 1e6 : rng.int(1, 20) * 100_000;
    investors.push({
      id: id("inv"),
      name,
      type,
      country: geo.country,
      city: rng.pick(geo.cities),
      stages: stagePool,
      geographies: rng.chance(0.6) ? [geo.region] : rng.pickN(["Latin America", "North America", "Europe"], 2),
      sectors: rng.pickN(TAXONOMY.sectors.map((s) => s.id), rng.int(1, 4)),
      aum,
      checkMin,
      checkMax: checkMin * rng.int(3, 15),
      founded: rng.int(1995, 2024),
      tier1: false,
      domain: type === "Angel" ? null : `${taxonomySlug(name).replace(/-/g, "")}.${rng.pick(["vc", "com", "capital", "fund"])}`,
      portfolio: new Map(),
      leads: 0,
    });
  }
  // Tier-1: ~5% of institutional funds, weighted toward bigger AUM.
  const institutional = investors.filter((x) => x.aum !== null).sort((a, b) => (b.aum ?? 0) - (a.aum ?? 0));
  institutional.slice(0, Math.ceil(institutional.length * 0.06)).forEach((x) => (x.tier1 = true));
  const investorsByStage = new Map<Stage, Investor[]>();
  for (const st of STAGES) investorsByStage.set(st, investors.filter((x) => x.stages.includes(st)));

  /* ---------------- companies ---------------- */
  const companies: Company[] = [];
  const usedDomains = new Set<string>();
  const usedNames = new Set<string>();
  const nCompanies = n(50_000);
  const sectorWeights = SECTOR_NAMES.map((s) =>
    s === "Financial Services" ? 16 : s === "Software & Internet" ? 16 : s === "Artificial Intelligence" ? 12 : s === "Agriculture & Food Systems" ? 8 : s === "Commerce & Consumer" ? 10 : 6,
  );
  for (let i = 0; i < nCompanies; i++) {
    const geo = rng.weighted(GEOGRAPHY, geoWeights);
    const sector = rng.weighted(SECTOR_NAMES, sectorWeights);
    const stage = rng.weighted(STAGES, [40, 30, 17, 9, 4]);
    const inds = SECTOR_INDUSTRIES[sector] ?? [];
    const industryNames = rng.pickN(inds, rng.int(1, 2));
    const verticalNames = rng.pickN(SECTOR_VERTICALS[sector] ?? [], rng.int(1, 2));
    const verticalIds = verticalNames.map(verticalId);
    const ecosystemIds = ECOSYSTEMS.filter((e) => e.verticals.some((v) => verticalNames.includes(v))).map((e) => `eco_${taxonomySlug(e.name)}`);
    const focus = rng.weighted(["B2B", "B2C", "B2B2C", "B2G"], [55, 25, 15, 5]);
    const models = rng.pickN(BUSINESS_MODELS, rng.weighted([1, 2], [65, 35]));

    let name = "";
    for (let tries = 0; tries < 30; tries++) {
      const base = cap(rng.pick(NAME_ROOTS) + rng.pick(NAME_ENDINGS));
      name = rng.chance(0.45) ? `${base} ${rng.pick(NAME_SUFFIXES[sector] ?? ["Labs"])}` : base;
      if (!usedNames.has(name)) break;
    }
    if (usedNames.has(name)) name = `${name} ${rng.pick(["Latam", "Global", "Andina", "One", "Plus"])}`;
    if (usedNames.has(name)) name = `${name} ${i}`;
    usedNames.add(name);
    const slugBase = taxonomySlug(name).replace(/-/g, "");
    let domain = "";
    for (const tld of [...(TLDS[geo.country] ?? ["com"]), "io", "co", "app"]) {
      const d = `${slugBase}.${tld}`;
      if (!usedDomains.has(d)) {
        domain = d;
        break;
      }
    }
    if (!domain) domain = `${slugBase}${rng.hex(4)}.com`;
    usedDomains.add(domain);

    const [eLo, eHi] = EMPLOYEES[stage];
    const latest = Math.max(1, Math.round(rng.logRange(eLo, eHi)));
    const growthMean = stage === "Pre-seed / Seed" ? 0.03 : stage === "Early" ? 0.025 : stage === "Growth" ? 0.015 : 0.006;
    const g = rng.normal(growthMean, 0.03);
    const employees = months.map((_, m) => Math.max(1, Math.round(latest / Math.pow(1 + g, 11 - m) * (1 + rng.normal(0, 0.01)))));
    employees[11] = latest;
    const webBase = rng.logRange(latest * 80, latest * 2500);
    const wg = rng.normal(0.02, 0.06);
    const web = months.map((_, m) => Math.max(10, Math.round((webBase / Math.pow(1 + wg, 11 - m)) * (1 + rng.normal(0, 0.08)))));
    const fBase = rng.logRange(latest * 20, latest * 600);
    const fg = rng.normal(0.025, 0.03);
    const followers = months.map((_, m) => Math.max(5, Math.round(fBase / Math.pow(1 + fg, 11 - m))));

    const [fLo, fHi] = FOUNDED[stage];
    const foundedYear = Math.min(today.getUTCFullYear(), rng.int(fLo, fHi));
    const customer = rng.pick(CUSTOMER_PHRASES[focus] ?? ["teams"]);
    const vName = verticalNames[0] ?? industryNames[0] ?? sector;
    const tagline = rng
      .pick(TAGLINE_TEMPLATES)
      .replace("{vertical}", vName)
      .replace("{customer}", customer)
      .replace("{region}", geo.region === "Latin America" ? rng.pick(["Latin America", "the Andes", geo.country]) : geo.country)
      .replace("{model}", models[0] ?? "SaaS");
    const description = `${name} builds ${vName.toLowerCase()} for ${customer}. Founded in ${foundedYear} and headquartered in ${rng.pick(geo.cities)}, ${geo.country}, the company sells through a ${(models[0] ?? "SaaS").toLowerCase()} model and focuses on ${industryNames.join(" and ").toLowerCase()}.`;

    companies.push({
      id: id("com"),
      name,
      domain,
      tagline: cap(tagline),
      description,
      foundedYear,
      city: rng.pick(geo.cities),
      country: geo.country,
      region: geo.region,
      stage,
      status: "Active",
      focus,
      models,
      sector,
      sectorId: `sec_${taxonomySlug(sector)}`,
      industryIds: industryNames.map((x) => `ind_${taxonomySlug(x)}`),
      verticalIds,
      verticalNames,
      ecosystemIds,
      employees,
      web,
      followers,
      bootstrapped: stage !== "Exit / Public" && rng.chance(0.12),
      rounds: [],
      investorIds: new Set(),
      highlights: [],
      rankScore: 0,
      rank: 0,
      signalCount: 0,
      disclosure: null,
      technologies: rng.pickN(TECHNOLOGIES, rng.int(2, 6)),
      certifications: stage === "Pre-seed / Seed" ? [] : rng.pickN(CERTS, rng.int(0, 2)),
      acquiredBy: null,
      ipo: false,
    });
  }

  /* ---------------- funding rounds ---------------- */
  const roundRows: Cell[][] = [];
  const roundInvestorRows: Cell[][] = [];
  const targetRounds = n(40_000);
  // Scale round probability so the total lands near the plan size.
  const expectedPerCompany = companies.reduce((acc, c) => acc + (c.bootstrapped ? 0 : ROUND_PATH[c.stage].length * 0.75), 0) / companies.length;
  const keepProb = Math.min(1, targetRounds / (companies.length * expectedPerCompany));
  for (const c of companies) {
    if (c.bootstrapped) continue;
    const path = ROUND_PATH[c.stage].filter((_, i, arr) => i === arr.length - 1 || rng.chance(0.75));
    let date = new Date(Date.UTC(c.foundedYear, rng.int(0, 11), rng.int(1, 28)));
    date = addMonths(date, rng.int(4, 18));
    const latam = c.region === "Latin America";
    for (const type of path) {
      if (!rng.chance(keepProb)) continue;
      if (date > today) date = addDays(today, -rng.int(1, 120));
      const [lo, hi] = ROUND_AMOUNT[type] ?? [1e6, 5e6];
      const amount = Math.round(rng.logRange(lo, hi) * (latam ? 0.6 : 1) / 10_000) * 10_000;
      const post = Math.round((amount * rng.float(3.5, 9)) / 100_000) * 100_000;
      const pool = investorsByStage.get(ROUND_STAGE_FIT[type] ?? "Early") ?? investors;
      const regional = pool.filter((x) => x.geographies.includes(c.region));
      const source = regional.length > 20 && rng.chance(0.7) ? regional : pool;
      const k = type === "Pre-seed" ? rng.int(1, 3) : rng.int(1, 5);
      const chosen = rng.pickN(source, k);
      // Tier-1 funds show up more often in strong companies' later rounds.
      if (type.startsWith("Series") && rng.chance(0.15)) {
        const t1 = rng.pick(institutional.slice(0, Math.max(1, Math.ceil(institutional.length * 0.06))));
        if (!chosen.includes(t1)) chosen.unshift(t1);
      }
      const r = { id: id("trx"), type, amount, date, post, investorIds: chosen.map((x) => x.id) };
      c.rounds.push(r);
      chosen.forEach((inv, idx) => {
        c.investorIds.add(inv.id);
        inv.portfolio.set(c.id, (inv.portfolio.get(c.id) ?? 0) + 1);
        if (idx === 0) inv.leads++;
        roundInvestorRows.push([r.id, inv.id, idx === 0]);
      });
      roundRows.push([
        r.id,
        c.id,
        type,
        amount,
        "USD",
        isoDate(date),
        post - amount,
        post,
        [`https://example.com/filings/${r.id}`],
        { amount_usd: { source: "synthetic", fetched_at: today.toISOString(), redistributable: true } },
      ]);
      date = addMonths(date, rng.int(10, 30));
    }
  }

  /* ---------------- acquisitions & IPOs ---------------- */
  const acquisitionRows: Cell[][] = [];
  const ipoRows: Cell[][] = [];
  const exitCandidates = companies.filter((c) => c.stage === "Exit / Public" || c.stage === "Late" || (c.stage === "Growth" && rng.chance(0.1)));
  const ipoTargets = rng.pickN(
    companies.filter((c) => c.stage === "Exit / Public"),
    n(300),
  );
  for (const c of ipoTargets) {
    c.ipo = true;
    c.status = "IPO";
    const ex = EXCHANGES.find((e) => e.country === c.country) ?? rng.pick(EXCHANGES);
    const valuation = Math.round(rng.logRange(200e6, 6e9) / 1e6) * 1e6;
    ipoRows.push([
      id("ipo"),
      c.id,
      isoDate(addDays(today, -rng.int(30, 3000))),
      ex.exchange,
      c.name.replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase(),
      Math.round(rng.float(8, 45) * 100) / 100,
      valuation,
      Math.round(valuation * rng.float(0.08, 0.2)),
    ]);
  }
  const acqPool = exitCandidates.filter((c) => !c.ipo);
  for (const c of rng.pickN(acqPool, Math.min(acqPool.length, n(2000)))) {
    const acquirer = rng.chance(0.6) ? rng.pick(ACQUIRERS) : null;
    const buyer = acquirer ? null : rng.pick(companies.filter((x) => x.stage === "Late" || x.stage === "Exit / Public"));
    if (buyer?.id === c.id) continue;
    c.status = "Acquired";
    c.acquiredBy = acquirer ?? buyer?.name ?? null;
    acquisitionRows.push([
      id("acq"),
      buyer?.id ?? null,
      acquirer ?? buyer?.name ?? "Undisclosed",
      c.id,
      isoDate(addDays(today, -rng.int(10, 2000))),
      rng.chance(0.6) ? Math.round(rng.logRange(5e6, 900e6) / 1e5) * 1e5 : null,
      "Completed",
      [`https://example.com/deals/${c.id}`],
    ]);
  }
  for (const c of companies) if (c.stage === "Pre-seed / Seed" && rng.chance(0.03)) c.status = "Closed";

  /* ---------------- people ---------------- */
  type Person = {
    id: string;
    first: string;
    last: string;
    country: string;
    city: string;
    companyIdx: number;
    title: string;
    dept: string;
    seniority: string;
    isFounder: boolean;
    years: number;
    highlights: Set<string>;
    followers: number;
    connections: number;
    schoolIdx: number;
    exp: { companyId: string | null; companyName: string; title: string; dept: string; start: Date; end: Date | null; founder: boolean }[];
  };
  const people: Person[] = [];
  const nPeople = n(250_000);
  const nameFor = (country: string) => {
    const lang = LANG_BY_COUNTRY[country] ?? "en";
    return { first: rng.pick(FIRST_NAMES[lang] ?? []), last: rng.pick(LAST_NAMES[lang] ?? []) };
  };
  const schoolsByCountry = new Map<string, number[]>();
  schools.forEach((s, i) => schoolsByCountry.set(s.country, [...(schoolsByCountry.get(s.country) ?? []), i]));
  const pickSchool = (country: string) => {
    const local = schoolsByCountry.get(country);
    return local && rng.chance(0.75) ? rng.pick(local) : rng.int(0, schools.length - 1);
  };

  const makePerson = (companyIdx: number, role: "founder" | "exec" | "staff"): Person => {
    const c = companies[companyIdx] as Company;
    const country = rng.chance(0.88) ? c.country : rng.pick(GEOGRAPHY).country;
    const { first, last } = nameFor(country);
    const dept = role === "founder" ? rng.weighted(["Engineering", "Product", "Sales", "Operations"], [40, 20, 25, 15]) : rng.weighted(DEPARTMENTS, [35, 18, 12, 12, 9, 6, 5, 3]);
    const titles = TITLES_BY_DEPT[dept] ?? ["Associate"];
    let title: string;
    let seniority: string;
    if (role === "founder") {
      title = rng.pick(["Co-founder & CEO", "Co-founder & CTO", "Co-founder & COO", "Founder & CEO", "Co-founder"]);
      seniority = "Founder";
    } else if (role === "exec") {
      title = titles[titles.length - 1 - rng.int(0, Math.min(2, titles.length - 1))] ?? "Head";
      seniority = /^(C|Chief)/.test(title) || /CTO|COO|CFO|CMO/.test(title) ? "C-Level" : /VP/.test(title) ? "VP" : "Director";
    } else {
      title = titles[rng.int(0, Math.max(0, titles.length - 3))] ?? "Associate";
      seniority = /Manager/.test(title) ? "Manager" : /Senior|Staff/.test(title) ? "Senior IC" : rng.chance(0.03) ? "Intern" : "IC";
    }
    const years = role === "founder" ? rng.int(4, 25) : role === "exec" ? rng.int(8, 28) : rng.int(1, 15);
    const p: Person = {
      id: id("per"),
      first,
      last,
      country,
      city: rng.pick(GEOGRAPHY.find((g) => g.country === country)?.cities ?? [c.city]),
      companyIdx,
      title,
      dept,
      seniority,
      isFounder: role === "founder",
      years,
      highlights: new Set(),
      followers: Math.round(rng.logRange(80, role === "staff" ? 3000 : 12000)),
      connections: Math.round(rng.logRange(150, role === "staff" ? 2500 : 9000)),
      schoolIdx: pickSchool(country),
      exp: [],
    };
    // Career history: 1–4 prior roles ending before the current one.
    const currentStart = role === "founder" ? new Date(Date.UTC(c.foundedYear, rng.int(0, 11), 1)) : addMonths(today, -rng.int(3, 60));
    let cursor = currentStart;
    const prior = rng.int(1, Math.min(4, 1 + Math.floor(years / 4)));
    for (let k = 0; k < prior; k++) {
      const len = rng.int(14, 60);
      const start = addMonths(cursor, -len);
      const big = rng.chance(0.22);
      const other = big ? null : companies[rng.int(0, companies.length - 1)] as Company;
      const priorFounder = role === "founder" && k === 0 && rng.chance(0.25);
      const d = rng.pick(DEPARTMENTS);
      p.exp.push({
        companyId: other?.id ?? null,
        companyName: other?.name ?? rng.pick(BIG_EMPLOYERS),
        title: priorFounder ? "Co-founder" : rng.pick(TITLES_BY_DEPT[d] ?? ["Associate"]),
        dept: d,
        start,
        end: cursor,
        founder: priorFounder,
      });
      if (big) p.highlights.add("Major Tech Experience");
      if (priorFounder) {
        p.highlights.add("Serial Founder");
        if (rng.chance(0.3)) p.highlights.add("Prior Exit");
      }
      cursor = start;
    }
    p.exp.unshift({ companyId: c.id, companyName: c.name, title, dept, start: currentStart, end: null, founder: role === "founder" });
    if (schools[p.schoolIdx]?.tier === 1) p.highlights.add("Top University");
    if (rng.chance(0.06)) p.highlights.add("Fortune 500 Experience");
    if (role === "founder" && rng.chance(0.02)) p.highlights.add("Prior IPO");
    return p;
  };

  const companyPeopleRows: Cell[][] = [];
  for (let ci = 0; ci < companies.length && people.length < nPeople; ci++) {
    const c = companies[ci] as Company;
    const nf = rng.weighted([1, 2, 3], [30, 50, 20]);
    const founders: Person[] = [];
    for (let k = 0; k < nf; k++) founders.push(makePerson(ci, "founder"));
    if (founders.length > 1 && rng.chance(0.08)) founders.forEach((f) => f.highlights.add("Repeat Co-founders"));
    people.push(...founders);
    const execs = (c.employees[11] ?? 0) > 20 ? rng.int(1, 4) : 0;
    for (let k = 0; k < execs; k++) people.push(makePerson(ci, "exec"));
  }
  while (people.length < nPeople) {
    const ci = rng.int(0, companies.length - 1);
    if ((companies[ci]?.employees[11] ?? 0) < 8) continue;
    people.push(makePerson(ci, "staff"));
  }
  // Influencer / Hyper Connector = top 5% percentiles.
  const followerCut = [...people].map((p) => p.followers).sort((a, b) => b - a)[Math.floor(people.length * 0.05)] ?? Infinity;
  const connCut = [...people].map((p) => p.connections).sort((a, b) => b - a)[Math.floor(people.length * 0.05)] ?? Infinity;
  for (const p of people) {
    if (p.followers >= followerCut) p.highlights.add("Influencer");
    if (p.connections >= connCut) p.highlights.add("Hyper Connector");
  }

  /* ---------------- talent signals ---------------- */
  const talentRows: Cell[][] = [];
  const signalCountByPerson = new Map<string, number>();
  const nTalent = n(30_000);
  const founderPool = people.filter((p) => p.isFounder && (companies[p.companyIdx]?.foundedYear ?? 0) >= today.getUTCFullYear() - 1);
  const anyPool = people;
  for (let i = 0; i < nTalent; i++) {
    const fromFounders = founderPool.length > 0 && rng.chance(0.4);
    const p = fromFounders ? rng.pick(founderPool) : rng.pick(anyPool);
    const c = companies[p.companyIdx] as Company;
    const type = fromFounders
      ? rng.weighted(["NEW_COMPANY", "OUT_OF_STEALTH"], [80, 20])
      : rng.weighted(["NEW_ROLE", "PROMOTION", "SEARCHING", "DEPARTURE", "NEW_COMPANY"], [35, 25, 15, 15, 10]);
    const stealth = type === "NEW_COMPANY" && rng.chance(0.45);
    const status = type === "SEARCHING" || type === "DEPARTURE" ? "HR" : stealth ? "STEALTH" : "LIVE";
    const prev = p.exp[1];
    let quality = 3;
    if (p.highlights.has("Serial Founder")) quality += 2;
    if (p.highlights.has("Prior Exit")) quality += 2;
    if (p.highlights.has("Major Tech Experience")) quality += 1;
    if (p.highlights.has("Top University")) quality += 1;
    if (p.seniority === "C-Level" || p.seniority === "Founder") quality += 1;
    const score = Math.max(1, Math.min(10, Math.round(quality + rng.normal(0, 1.2))));
    const vertical = c.verticalNames[0] ?? c.sector;
    const name = `${p.first} ${p.last}`;
    const summary =
      type === "NEW_COMPANY"
        ? stealth
          ? `${name} is co-founding a stealth company in ${vertical.toLowerCase()}${prev ? `, previously ${prev.title} at ${prev.companyName}` : ""}.`
          : `${name} co-founded ${c.name} (${vertical})${prev ? ` after ${prev.title} at ${prev.companyName}` : ""}.`
        : type === "OUT_OF_STEALTH"
          ? `${c.name} came out of stealth with ${name} as ${p.title}; building ${vertical.toLowerCase()} for ${c.focus} customers.`
          : type === "NEW_ROLE"
            ? `${name} joined ${c.name} as ${p.title}${prev ? `, moving from ${prev.companyName}` : ""}.`
            : type === "PROMOTION"
              ? `${name} was promoted to ${p.title} at ${c.name}.`
              : type === "SEARCHING"
                ? `${name} left ${prev?.companyName ?? c.name} and is exploring what's next.`
                : `${name} departed ${c.name} after ${rng.int(2, 7)} years.`;
    const daysAgo = Math.floor(Math.pow(rng.next(), 2) * 180);
    talentRows.push([
      id("sig"),
      p.id,
      type,
      status,
      score,
      summary,
      isoDate(addDays(today, -daysAgo)),
      type === "NEW_COMPANY" && !stealth ? c.id : type === "OUT_OF_STEALTH" ? c.id : null,
      prev?.companyId ? [prev.companyId] : [],
      [{ kind: rng.pick(["company_site", "registry", "press_release", "news"]) }],
    ]);
    signalCountByPerson.set(p.id, (signalCountByPerson.get(p.id) ?? 0) + 1);
    if (stealth) p.highlights.add("Stealth");
    c.signalCount++;
  }

  /* ---------------- news ---------------- */
  const newsItemRows: Cell[][] = [];
  const newsSignalRows: Cell[][] = [];
  const nNews = n(20_000);
  for (let i = 0; i < nNews; i++) {
    const c = companies[Math.floor(Math.pow(rng.next(), 1.6) * companies.length)] as Company;
    const category = rng.weighted(["funding", "traction", "revenue", "deals", "profitability", "other"], [28, 26, 14, 10, 7, 15]);
    const lastRound = c.rounds[c.rounds.length - 1];
    const figure = category === "funding" && lastRound ? lastRound.amount : category === "revenue" ? Math.round(rng.logRange(1e6, 80e6)) : null;
    const title =
      category === "funding"
        ? `${c.name} raises ${figure ? `$${(figure / 1e6).toFixed(1)}M` : "new funding"} to expand ${c.verticalNames[0]?.toLowerCase() ?? "its platform"}`
        : category === "traction"
          ? `${c.name} passes ${rng.pick(["10,000", "50,000", "100,000", "1 million"])} ${c.focus === "B2C" ? "users" : "customers"} in ${c.country}`
          : category === "revenue"
            ? `${c.name} reports ${figure ? `$${(figure / 1e6).toFixed(1)}M` : "record"} annualised revenue`
            : category === "deals"
              ? `${c.name} signs partnership with ${rng.pick(ACQUIRERS)}`
              : category === "profitability"
                ? `${c.name} reaches operating profitability`
                : `${c.name} opens new office in ${rng.pick(GEOGRAPHY).cities[0]}`;
    const publishedAt = addDays(today, -Math.floor(Math.pow(rng.next(), 1.8) * 365));
    publishedAt.setUTCHours(rng.int(6, 22), rng.int(0, 59));
    const itemId = id("nws");
    const score = Math.round(Math.min(5, Math.max(0, rng.normal(category === "other" ? 1.8 : 3, 1))) * 10) / 10;
    newsItemRows.push([itemId, `https://example.com/news/${itemId}`, rng.pick(PUBLISHERS), title, publishedAt.toISOString(), null]);
    newsSignalRows.push([id("nsg"), c.id, itemId, category, title.replace(c.name, "The company") + ".", score, score >= 4, figure ? { amount_usd: figure } : null, publishedAt.toISOString()]);
    c.signalCount++;
  }

  /* ---------------- derived company fields: growth, highlights, rank ---------------- */
  const growth = (series: number[], back: number) => {
    const now = series[11] ?? 0;
    const then = series[11 - back] ?? now;
    return then > 0 ? (now - then) / then : 0;
  };
  const investorById = new Map(investors.map((x) => [x.id, x]));
  const z = (xs: number[]) => {
    const mean = xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, xs.length)) || 1;
    return xs.map((x) => (x - mean) / sd);
  };
  for (const st of STAGES) {
    const group = companies.filter((c) => c.stage === st);
    const hc = z(group.map((c) => growth(c.employees, 3)));
    const wv = z(group.map((c) => growth(c.web, 3)));
    const fund = z(group.map((c) => Math.log1p(c.rounds.reduce((a, r) => a + r.amount, 0))));
    const soc = z(group.map((c) => growth(c.followers, 3)));
    group.forEach((c, i) => {
      const iq = c.investorIds.size ? [...c.investorIds].filter((x) => investorById.get(x)?.tier1).length / c.investorIds.size : 0;
      c.rankScore = 0.3 * (hc[i] ?? 0) + 0.25 * (wv[i] ?? 0) + 0.15 * (fund[i] ?? 0) + 0.15 * iq + 0.1 * Math.min(3, c.signalCount / 2) + 0.05 * (soc[i] ?? 0);
    });
  }
  [...companies].sort((a, b) => b.rankScore - a.rankScore).forEach((c, i) => (c.rank = i + 1));
  for (const c of companies) {
    const h = growth(c.employees, 3);
    if (h > 0.25) c.highlights.push("headcount_surge");
    else if (h > 0.1) c.highlights.push("strong_headcount_growth");
    if (growth(c.web, 3) > 0.3) c.highlights.push("strong_web_traffic_growth");
    if (growth(c.followers, 3) > 0.2) c.highlights.push("strong_social_growth");
    if ([...c.investorIds].some((x) => investorById.get(x)?.tier1)) c.highlights.push("top_tier_investors");
    if ([...c.investorIds].some((x) => investorById.get(x)?.type === "Accelerator")) c.highlights.push("accelerator_backed");
    const last = c.rounds[c.rounds.length - 1];
    if (last && today.getTime() - last.date.getTime() < 180 * 86_400_000) c.highlights.push("recently_funded");
    if (!last || today.getTime() - last.date.getTime() > 730 * 86_400_000) c.highlights.push("no_recent_funding");
  }

  /* ---------------- estimates & disclosures ---------------- */
  const estimateRows: Cell[][] = [];
  const disclosureRows: Cell[][] = [];
  const latestEstimate = new Map<string, { rev: number; val: number }>();
  for (const c of companies) {
    if (rng.chance(0.05)) {
      const base = estimateV0({ employeeCount: c.employees[11] ?? null, sector: c.sector, growthStage: c.stage, region: c.region, lastPostMoneyUsd: null, monthsSinceLastRound: null });
      const amount = Math.round((base.revenueP50 * rng.float(0.6, 1.5)) / 10_000) * 10_000;
      const month = rng.int(4, 11);
      c.disclosure = { amount, month };
      disclosureRows.push([
        id("rvd"),
        c.id,
        amount,
        rng.pick(["ARR", "Revenue"]),
        isoDate(months[month] as Date),
        `https://example.com/disclosures/${c.id}`,
        rng.pick(PUBLISHERS),
        (months[month] as Date).toISOString(),
        "seed-qa",
        "verified",
      ]);
    }
    for (let m = 0; m < 12; m++) {
      const monthDate = months[m] as Date;
      const priorRounds = c.rounds.filter((r) => r.date <= monthDate);
      const last = priorRounds[priorRounds.length - 1];
      const disclosureUsd = c.disclosure && c.disclosure.month === m ? c.disclosure.amount : c.disclosure && m > c.disclosure.month ? c.disclosure.amount * (c.employees[m]! / c.employees[c.disclosure.month]!) : null;
      const e = estimateV0({
        employeeCount: c.employees[m] ?? null,
        sector: c.sector,
        growthStage: c.stage,
        region: c.region,
        lastPostMoneyUsd: last?.post ?? null,
        monthsSinceLastRound: last ? (monthDate.getTime() - last.date.getTime()) / (30 * 86_400_000) : null,
        disclosureUsd,
      });
      estimateRows.push([c.id, isoDate(monthDate), e.revenueP10, e.revenueP50, e.revenueP90, "ARR", e.valuationP10, e.valuationP50, e.valuationP90, e.confidence, e.drivers, MODEL_VERSION]);
      if (m === 11) latestEstimate.set(c.id, { rev: e.revenueP50, val: e.valuationP50 });
    }
  }

  /* ---------------- competitors (v0: taxonomy + model overlap, 0–10) ---------------- */
  const competitorRows: Cell[][] = [];
  const byVertical = new Map<string, Company[]>();
  for (const c of companies) for (const v of c.verticalIds) byVertical.set(v, [...(byVertical.get(v) ?? []), c]);
  for (const c of companies) {
    const pool = byVertical.get(c.verticalIds[0] ?? "") ?? [];
    const candidates = rng.pickN(pool, Math.min(pool.length, 40)).filter((x) => x.id !== c.id);
    const scored = candidates
      .map((x) => {
        let s = 3;
        const reasons: string[] = [];
        const sharedV = x.verticalIds.filter((v) => c.verticalIds.includes(v)).length;
        s += sharedV * 1.5;
        if (x.industryIds.some((i) => c.industryIds.includes(i))) {
          s += 1.5;
          reasons.push("same industry");
        }
        if (x.models.some((m) => c.models.includes(m))) {
          s += 1;
          reasons.push("same business model");
        }
        if (x.focus === c.focus) {
          s += 1;
          reasons.push(`${c.focus} focus`);
        }
        if (x.stage === c.stage) {
          s += 0.5;
          reasons.push("same stage");
        }
        if (x.region === c.region) {
          s += 1;
          reasons.push(`both in ${c.region}`);
        }
        return { x, s: Math.min(10, Math.round((s + rng.normal(0, 0.4)) * 10) / 10), reason: `Both build ${c.verticalNames[0]?.toLowerCase() ?? "similar products"}${reasons.length ? `; ${reasons.slice(0, 2).join(", ")}` : ""}` };
      })
      .sort((a, b) => b.s - a.s)
      .slice(0, 8);
    for (const { x, s, reason } of scored) competitorRows.push([c.id, x.id, s, reason, today.toISOString()]);
  }

  /* ---------------- metrics (monthly points in the partitioned daily table) ---------------- */
  const metricRows: Cell[][] = [];
  for (const c of companies) {
    for (let m = 0; m < 12; m++) {
      const d = isoDate(months[m] as Date);
      metricRows.push([c.id, "employee_count", d, c.employees[m] ?? 0]);
      metricRows.push([c.id, "web_visits", d, c.web[m] ?? 0]);
      metricRows.push([c.id, "linkedin_followers", d, c.followers[m] ?? 0]);
    }
  }

  /* ---------------- rows: companies ---------------- */
  const companyRows: Cell[][] = companies.map((c) => {
    const last = c.rounds[c.rounds.length - 1];
    const total = c.rounds.reduce((a, r) => a + r.amount, 0);
    const est = latestEstimate.get(c.id);
    return [
      c.id,
      c.name,
      [],
      c.domain,
      [],
      c.tagline,
      c.description,
      c.foundedYear,
      c.city,
      null,
      c.country,
      c.region,
      c.status,
      c.stage,
      c.focus,
      c.models,
      c.sectorId,
      c.industryIds,
      c.verticalIds,
      c.ecosystemIds,
      c.employees[11] ?? null,
      employeeRange(c.employees[11] ?? 1),
      c.rank,
      Math.round(c.rankScore * 1000) / 1000,
      c.highlights,
      c.highlights.filter(() => rng.chance(0.2)),
      [],
      c.bootstrapped,
      total || null,
      last?.amount ?? null,
      last ? isoDate(last.date) : null,
      last?.type ?? null,
      c.rounds.length,
      last?.post ?? null,
      c.investorIds.size,
      c.web[11] ?? null,
      Math.round(growth(c.web, 3) * 1000) / 1000,
      Math.round(growth(c.employees, 3) * 1000) / 1000,
      Math.round(growth(c.employees, 11) * 1000) / 1000,
      c.followers[11] ?? null,
      Math.round(growth(c.followers, 3) * 1000) / 1000,
      est?.rev ?? null,
      est?.val ?? null,
      rng.chance(0.15) ? rng.int(1, 30) : 0,
      rng.chance(0.3) ? rng.int(1, 12) : 0,
      c.technologies,
      c.certifications,
      c.focus === "B2B" ? rng.pick(["SMB", "Mid-market", "Enterprise"]) : c.focus === "B2C" ? "Consumers" : "Mixed",
      c.signalCount > 3 ? "Featured in multiple press mentions this year" : null,
      `hello@${c.domain}`,
      { website: `https://${c.domain}` },
      c.stage === "Pre-seed / Seed" ? null : { g2: { rating: Math.round(rng.float(3.6, 4.9) * 10) / 10, count: rng.int(5, 400) } },
      { "*": { source: "synthetic", fetched_at: today.toISOString(), redistributable: true } },
    ];
  });

  /* ---------------- rows: people & related ---------------- */
  const personRows: Cell[][] = [];
  const experienceRows: Cell[][] = [];
  const educationRows: Cell[][] = [];
  const emailRows: Cell[][] = [];
  const usedLinkedin = new Set<string>();
  for (const p of people) {
    const c = companies[p.companyIdx] as Company;
    const school = schools[p.schoolIdx];
    let li = `https://demo.linkedin.invalid/in/${taxonomySlug(`${p.first}-${p.last}`)}-${rng.hex(6)}`;
    while (usedLinkedin.has(li)) li = `${li}${rng.hex(2)}`;
    usedLinkedin.add(li);
    personRows.push([
      p.id,
      `${p.first} ${p.last}`,
      p.first,
      p.last,
      `${p.title} at ${c.name}`,
      `${p.first} is ${p.title} at ${c.name}, working on ${c.verticalNames[0]?.toLowerCase() ?? "the product"}. ${p.years} years of experience across ${p.exp.length} companies${school ? `; studied at ${school.name}` : ""}.`,
      `${p.city}, ${p.country}`,
      p.country,
      li,
      null,
      p.dept === "Engineering" && rng.chance(0.3) ? `https://example.com/gh/${p.id}` : null,
      null,
      p.title,
      c.id,
      c.name,
      p.dept,
      p.seniority,
      p.years,
      [...p.highlights],
      school ? `${rng.pick(DEGREES)}, ${school.name}` : null,
      p.followers,
      p.connections,
      signalCountByPerson.get(p.id) ?? 0,
      { "*": { source: "synthetic", fetched_at: today.toISOString(), redistributable: true } },
    ]);
    if (p.isFounder) companyPeopleRows.push([c.id, p.id, p.title, p.dept, p.seniority, true, isoDate(p.exp[0]!.start), null, true]);
    else if (p.seniority === "C-Level" || p.seniority === "VP" || p.seniority === "Director") companyPeopleRows.push([c.id, p.id, p.title, p.dept, p.seniority, false, isoDate(p.exp[0]!.start), null, true]);
    for (const e of p.exp) {
      experienceRows.push([id("exp"), p.id, e.companyId, e.companyName, e.title, e.dept, isoDate(e.start), e.end ? isoDate(e.end) : null, e.end === null, e.founder]);
    }
    if (school) educationRows.push([p.id, school.id, rng.pick(DEGREES), rng.pick(FIELDS), today.getUTCFullYear() - p.years - 4, today.getUTCFullYear() - p.years]);
    if (rng.chance(0.6)) {
      const local = `${taxonomySlug(p.first)}.${taxonomySlug(p.last)}`.replace(/-/g, "");
      emailRows.push([p.id, `${local}@${c.domain}`, "work", rng.weighted(["verified", "catch_all", "unknown"], [70, 20, 10]), "pattern+verify", today.toISOString()]);
    }
  }

  /* ---------------- rows: investors ---------------- */
  const valuationByCompany = new Map(companies.map((c) => [c.id, c.rounds[c.rounds.length - 1]?.post ?? 0]));
  const statusByCompany = new Map(companies.map((c) => [c.id, c.status]));
  const investorRows: Cell[][] = investors.map((inv) => {
    const portfolio = [...inv.portfolio.entries()];
    const exits = portfolio.filter(([cid]) => statusByCompany.get(cid) === "Acquired" || statusByCompany.get(cid) === "IPO").length;
    const followOn = portfolio.length ? portfolio.filter(([, k]) => k > 1).length / portfolio.length : null;
    const unicorns = portfolio.filter(([cid]) => (valuationByCompany.get(cid) ?? 0) >= 1e9).length;
    const highlights: string[] = [];
    if (inv.tier1) highlights.push("Tier-1");
    if (inv.leads >= 10) highlights.push("Lead investor");
    if (portfolio.length >= 5) highlights.push("Active");
    if (unicorns > 0) highlights.push("Unicorn backer");
    if ((followOn ?? 0) > 0.35) highlights.push("High follow-on rate");
    return [
      inv.id,
      inv.name,
      inv.type,
      inv.domain,
      inv.type === "Angel"
        ? `Angel investor based in ${inv.city} backing ${inv.stages.join(", ").toLowerCase()} founders.`
        : `${inv.type} investor based in ${inv.city}, ${inv.country}, focused on ${inv.stages.join(", ").toLowerCase()} companies in ${inv.geographies.join(" and ")}.`,
      inv.city,
      inv.country,
      inv.founded,
      inv.aum,
      inv.checkMin,
      inv.checkMax,
      inv.stages,
      inv.geographies,
      inv.sectors,
      portfolio.length,
      exits,
      inv.leads,
      followOn === null ? null : Math.round(followOn * 1000) / 1000,
      unicorns,
      highlights,
      null,
      { "*": { source: "synthetic", fetched_at: today.toISOString(), redistributable: true } },
    ];
  });

  const tables: Record<string, TableRows> = {
    taxonomy_nodes: { columns: ["id", "kind", "name", "slug", "parent_id", "path"], rows: taxonomyRows },
    schools: { columns: ["id", "name", "domain", "country", "tier"], rows: schoolRows },
    investors: {
      columns: ["id", "name", "type", "domain", "description", "hq_city", "hq_country", "founded_year", "aum_usd", "check_min", "check_max", "target_stages", "geographies", "sectors", "investments_count", "exits_count", "leads_count", "follow_on_rate", "unicorn_count", "highlights", "person_id", "provenance"],
      rows: investorRows,
    },
    companies: {
      columns: [
        "id", "name", "aliases", "domain", "domain_aliases", "tagline", "description", "founded_year", "hq_city", "hq_state", "hq_country", "hq_region",
        "operating_status", "growth_stage", "customer_focus", "business_models", "sector_id", "industry_ids", "tech_vertical_ids", "ecosystem_ids",
        "employee_count", "employee_range", "rank", "rank_score", "highlights", "new_highlights", "tags", "bootstrapped", "total_funding_usd",
        "last_funding_usd", "last_funding_date", "last_funding_type", "round_count", "post_money_valuation_usd", "investor_count", "web_visits",
        "web_visits_growth_3m", "headcount_growth_3m", "headcount_growth_12m", "linkedin_followers", "social_growth_3m", "est_revenue_usd",
        "est_valuation_usd", "patent_count", "trademark_count", "technologies", "certifications", "customer_profile", "traction_highlights",
        "contact_email", "socials", "reviews", "provenance",
      ],
      rows: companyRows,
    },
    people: {
      columns: [
        "id", "full_name", "first", "last", "headline", "bio", "location", "country", "linkedin_url", "x_url", "github_url", "avatar_url",
        "current_title", "current_company_id", "current_company_name", "department", "seniority", "years_experience", "highlights",
        "education_summary", "followers", "connections", "talent_signal_count", "provenance",
      ],
      rows: personRows,
    },
    company_people: { columns: ["company_id", "person_id", "title", "department", "seniority", "is_founder", "start", "end", "is_current"], rows: companyPeopleRows },
    person_experience: { columns: ["id", "person_id", "company_id", "company_name", "title", "department", "start", "end", "is_current", "is_founder"], rows: experienceRows },
    person_education: { columns: ["person_id", "school_id", "degree", "field", "start", "end"], rows: educationRows },
    person_emails: { columns: ["person_id", "email", "type", "status", "source", "checked_at"], rows: emailRows },
    funding_rounds: { columns: ["id", "company_id", "type", "amount_usd", "currency", "announced_date", "pre_money_usd", "post_money_usd", "source_urls", "provenance"], rows: roundRows },
    round_investors: { columns: ["round_id", "investor_id", "is_lead"], rows: roundInvestorRows },
    acquisitions: { columns: ["id", "acquirer_id", "acquirer_name", "target_id", "date", "amount_usd", "status", "source_urls"], rows: acquisitionRows },
    ipos: { columns: ["id", "company_id", "date", "exchange", "ticker", "share_price", "valuation_usd", "raised_usd"], rows: ipoRows },
    talent_signals: { columns: ["id", "person_id", "type", "status", "score", "summary", "signal_date", "new_company_id", "prev_company_ids", "sources"], rows: talentRows },
    news_items: { columns: ["id", "url", "publisher", "title", "published_at", "body_hash"], rows: newsItemRows },
    news_signals: { columns: ["id", "company_id", "news_item_id", "category", "summary", "score", "is_major", "figures", "published_at"], rows: newsSignalRows },
    company_competitors: { columns: ["company_id", "competitor_id", "overlap_score", "reason", "computed_at"], rows: competitorRows },
    company_estimates: {
      columns: ["company_id", "month", "revenue_p10", "revenue_p50", "revenue_p90", "revenue_type", "valuation_p10", "valuation_p50", "valuation_p90", "confidence", "drivers", "model_version"],
      rows: estimateRows,
    },
    revenue_disclosures: { columns: ["id", "company_id", "amount_usd", "type", "period", "source_url", "publisher", "published_at", "verified_by", "status"], rows: disclosureRows },
    company_metrics_daily: { columns: ["company_id", "metric", "date", "value"], rows: metricRows },
  };

  return {
    tables,
    sample: {
      companies: companies.slice(0, 200).map((c) => ({ id: c.id, name: c.name, country: c.country, stage: c.stage, sectorId: c.sectorId, verticalIds: c.verticalIds })),
      people: people.slice(0, 200).map((p) => ({ id: p.id, name: `${p.first} ${p.last}`, isFounder: p.isFounder })),
      investors: investors.slice(0, 200).map((x) => ({ id: x.id, name: x.name, type: x.type, tier1: x.tier1 })),
      companyIdsByCountry: (country: string) => companies.filter((c) => c.country === country).map((c) => c.id),
      companyIds: companies.map((c) => c.id),
      topCompanyIds: [...companies].sort((a, b) => a.rank - b.rank).slice(0, 200).map((c) => c.id),
      founderIds: people.filter((p) => p.isFounder && p.highlights.size > 1).slice(0, 200).map((p) => p.id),
      tier1InvestorIds: investors.filter((x) => x.tier1).map((x) => x.id),
    },
    months,
    today,
  };
}
