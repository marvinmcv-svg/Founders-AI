/**
 * SEC EDGAR Form D (plan 9.1 public pipeline, D-073): daily index → primary_doc.xml → typed filing.
 * Public-domain data (redistributable). SEC fair-access rules: a descriptive User-Agent with a
 * contact (SEC_USER_AGENT) and at most 10 requests/second — we stay at 8.
 * Pure parsing here; the job (jobs/sec-formd.ts) does the database work.
 */
import { GEOGRAPHY } from "@founders/core/taxonomy";

export const EDGAR = "https://www.sec.gov";

export type IndexEntry = { form: "D" | "D/A"; company: string; cik: string; filedDate: string; accession: string; path: string };

/** Parse an EDGAR daily `form.YYYYMMDD.idx`, keeping Form D and D/A rows. */
export function parseDailyIndex(text: string): IndexEntry[] {
  const out: IndexEntry[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^(D|D\/A)\s{2,}(.+?)\s{2,}(\d+)\s+(\d{8})\s+(edgar\/data\/\S+\.txt)\s*$/.exec(line);
    if (!m) continue;
    const [, form, company, cik, d, path] = m as unknown as [string, "D" | "D/A", string, string, string, string];
    const accession = path.split("/").pop()!.replace(/\.txt$/, "");
    out.push({ form, company: company.trim(), cik: String(Number(cik)), filedDate: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, accession, path });
  }
  return out;
}

export const dailyIndexUrl = (date: string) => {
  const [y, m, d] = date.split("-");
  const q = Math.floor((Number(m) - 1) / 3) + 1;
  return `${EDGAR}/Archives/edgar/daily-index/${y}/QTR${q}/form.${y}${m}${d}.idx`;
};
export const primaryDocUrl = (e: Pick<IndexEntry, "cik" | "accession">) => `${EDGAR}/Archives/edgar/data/${e.cik}/${e.accession.replace(/-/g, "")}/primary_doc.xml`;
export const filingIndexUrl = (e: Pick<IndexEntry, "cik" | "accession">) => `${EDGAR}/Archives/edgar/data/${e.cik}/${e.accession.replace(/-/g, "")}/${e.accession}-index.htm`;

/* ------------------------------------------------------------------ */
/* Minimal XML access (Form D is a flat, fixed schema)                 */
/* ------------------------------------------------------------------ */

const decode = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n))).replace(/&amp;/g, "&").trim();

function blocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g");
  return [...xml.matchAll(re)].map((m) => m[1] ?? "");
}
const block = (xml: string, tag: string) => blocks(xml, tag)[0] ?? "";
const text = (xml: string, tag: string): string | null => {
  const b = blocks(xml, tag)[0];
  if (b === undefined) return null;
  const v = decode(b);
  return v === "" ? null : v;
};
const num = (xml: string, tag: string): number | null => {
  const v = text(xml, tag);
  if (v == null || !/^-?\d+(\.\d+)?$/.test(v)) return null; // "Indefinite" and blanks → null
  return Number(v);
};
const bool = (xml: string, tag: string) => text(xml, tag)?.toLowerCase() === "true";

/* ------------------------------------------------------------------ */
/* Typed filing                                                        */
/* ------------------------------------------------------------------ */

export type RelatedPerson = { name: string; relationships: string[]; title: string | null };

export type FormDFiling = {
  submissionType: string;
  cik: string;
  name: string;
  entityType: string | null;
  jurisdiction: string | null;
  yearOfInc: number | null;
  city: string | null;
  stateOrCountry: string | null;
  stateOrCountryDescription: string | null;
  industryGroup: string | null;
  fundType: string | null;
  isAmendment: boolean;
  previousAccession: string | null;
  dateOfFirstSale: string | null;
  securities: string[];
  totalOfferingAmount: number | null;
  totalAmountSold: number | null;
  investorsCount: number | null;
  relatedPersons: RelatedPerson[];
};

export function parseFormD(xml: string): FormDFiling {
  if (!/<edgarSubmission[\s>]/.test(xml)) throw new Error("Not a Form D submission");
  const issuer = block(xml, "primaryIssuer");
  const address = block(issuer, "issuerAddress");
  const offering = block(xml, "offeringData");
  const filing = block(offering, "typeOfFiling");
  const sec = block(offering, "typesOfSecuritiesOffered");
  const amounts = block(offering, "offeringSalesAmounts");
  const securities = [...sec.matchAll(/<is(\w+?)Type>\s*true\s*<\/is\w+?Type>/g)].map((m) => m[1] ?? "");
  const other = text(sec, "descriptionOfOtherType");
  if (other) securities.push(other);
  const year = num(block(issuer, "yearOfInc"), "value");
  const firstSale = text(block(filing, "dateOfFirstSale"), "value");
  return {
    submissionType: text(xml, "submissionType") ?? "D",
    cik: String(Number(text(issuer, "cik") ?? "0")),
    name: text(issuer, "entityName") ?? "",
    entityType: text(issuer, "entityType"),
    jurisdiction: text(issuer, "jurisdictionOfInc"),
    yearOfInc: year,
    city: text(address, "city"),
    stateOrCountry: text(address, "stateOrCountry"),
    stateOrCountryDescription: text(address, "stateOrCountryDescription"),
    industryGroup: text(block(offering, "industryGroup"), "industryGroupType"),
    fundType: text(block(offering, "investmentFundInfo"), "investmentFundType"),
    isAmendment: bool(filing, "isAmendment"),
    previousAccession: text(filing, "previousAccessionNumber"),
    dateOfFirstSale: firstSale && /^\d{4}-\d{2}-\d{2}$/.test(firstSale) ? firstSale : null,
    securities,
    totalOfferingAmount: num(amounts, "totalOfferingAmount"),
    totalAmountSold: num(amounts, "totalAmountSold"),
    investorsCount: num(block(offering, "investors"), "totalNumberAlreadyInvested"),
    relatedPersons: blocks(block(xml, "relatedPersonsList"), "relatedPersonInfo").map((p) => {
      const n = block(p, "relatedPersonName");
      return {
        name: [text(n, "firstName"), text(n, "middleName"), text(n, "lastName")].filter(Boolean).join(" "),
        relationships: blocks(block(p, "relatedPersonRelationshipList"), "relationship").map(decode),
        title: text(p, "relationshipClarification"),
      };
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Classification                                                      */
/* ------------------------------------------------------------------ */

const US_STATES = new Set("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR GU VI AS MP".split(" "));

/** Industry groups that are not venture-style operating companies (real estate, extraction, pooled vehicles handled separately). */
const NON_STARTUP_GROUPS = new Set([
  "Commercial", "Construction", "REITS and Finance", "Residential", "Other Real Estate", "Oil and Gas", "Coal Mining", "Other Energy",
  "Investing", "Insurance", "Commercial Banking", "Lodging and Conventions", "Restaurants", "Agriculture", "Airlines and Airports",
]);
/** Issuer names of vehicles rather than companies. */
const VEHICLE_NAME = /\b(L\.?P\.?|DST|fund|series|SPV|investors?|holdings? (I|II|III|IV|V)\b|capital partners|trust)\b/i;

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, p: string, c: string) => p + c.toUpperCase());

export type Location = { city: string | null; state: string | null; country: string | null; region: string | null };

export function location(f: FormDFiling): Location {
  const code = f.stateOrCountry?.toUpperCase() ?? null;
  const city = f.city ? titleCase(f.city) : null;
  if (code && US_STATES.has(code)) return { city, state: code, country: "United States", region: "North America" };
  const desc = f.stateOrCountryDescription?.toLowerCase() ?? "";
  const g = GEOGRAPHY.find((x) => x.country.toLowerCase() === desc || x.code === code);
  return { city, state: null, country: g?.country ?? (f.stateOrCountryDescription ? titleCase(f.stateOrCountryDescription) : null), region: g?.region ?? null };
}

export type Classified =
  | { kind: "company"; roundType: string; growthStage: string }
  | { kind: "fund"; investorType: "VC" | "PE" }
  | { kind: "skip"; reason: string };

/**
 * Stage is not on Form D, so it is inferred from the amount sold and labelled as inferred in
 * provenance (D-073). Debt-only offerings are "Debt".
 */
export function classify(f: FormDFiling): Classified {
  if (!f.name) return { kind: "skip", reason: "no issuer name" };
  if (f.industryGroup === "Pooled Investment Fund") {
    if (f.fundType === "Venture Capital Fund") return { kind: "fund", investorType: "VC" };
    if (f.fundType === "Private Equity Fund") return { kind: "fund", investorType: "PE" };
    return { kind: "skip", reason: `fund type ${f.fundType ?? "unknown"}` };
  }
  if (f.industryGroup && NON_STARTUP_GROUPS.has(f.industryGroup)) return { kind: "skip", reason: `industry ${f.industryGroup}` };
  if (VEHICLE_NAME.test(f.name)) return { kind: "skip", reason: "investment vehicle name" };
  if (!f.totalAmountSold || f.totalAmountSold <= 0) return { kind: "skip", reason: "nothing sold yet" };
  const onlyDebt = f.securities.length > 0 && f.securities.every((s) => s === "Debt");
  if (onlyDebt) return { kind: "company", roundType: "Debt", growthStage: "Early" };
  const a = f.totalAmountSold;
  const [roundType, growthStage] =
    a < 750_000 ? ["Pre-seed", "Pre-seed / Seed"]
    : a < 4_000_000 ? ["Seed", "Pre-seed / Seed"]
    : a < 20_000_000 ? ["Series A", "Early"]
    : a < 60_000_000 ? ["Series B", "Growth"]
    : a < 150_000_000 ? ["Series C", "Growth"]
    : ["Growth", "Late"];
  return { kind: "company", roundType, growthStage };
}

/** Placeholder domain for issuers without a known website; `.invalid` is ignored by entity resolution. */
export const secPlaceholderDomain = (cik: string) => `cik${cik}.sec.invalid`;

/* ------------------------------------------------------------------ */
/* HTTP client (fair access)                                           */
/* ------------------------------------------------------------------ */

export type FetchText = (url: string) => Promise<{ status: number; text: string }>;

export class SecClient {
  private last = 0;
  constructor(
    private readonly fetchText: FetchText,
    private readonly minIntervalMs = 125,
  ) {}

  static live(userAgent: string): SecClient {
    return new SecClient(async (url) => {
      const r = await fetch(url, { headers: { "User-Agent": userAgent, "Accept-Encoding": "gzip, deflate" } });
      return { status: r.status, text: r.status === 200 ? await r.text() : "" };
    });
  }

  private async get(url: string) {
    const wait = this.last + this.minIntervalMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.last = Date.now();
    return this.fetchText(url);
  }

  /** Form D rows of a day's index; [] on weekends/holidays (404). */
  async dailyIndex(date: string): Promise<IndexEntry[]> {
    const r = await this.get(dailyIndexUrl(date));
    if (r.status === 404 || r.status === 403) return [];
    if (r.status !== 200) throw new Error(`EDGAR index ${date}: HTTP ${r.status}`);
    return parseDailyIndex(r.text);
  }

  async filing(e: IndexEntry): Promise<FormDFiling | null> {
    const r = await this.get(primaryDocUrl(e));
    if (r.status !== 200) return null;
    return parseFormD(r.text);
  }
}
