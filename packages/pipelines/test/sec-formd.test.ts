/**
 * SEC Form D public pipeline (plan 9.1, D-073) on real EDGAR fixtures (2026-11-24):
 * index parsing, XML parsing, classification, and end-to-end ingest with provenance and amendments.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
config({ path: "../../.env" });
import { getSql } from "@founders/db";
import { fixtureFetcher, ingestFiling, runSecFormD } from "../src/jobs/sec-formd";
import { classify, dailyIndexUrl, location, parseDailyIndex, parseFormD, primaryDocUrl, SecClient, type IndexEntry } from "../src/providers/sec-formd";

const DIR = path.join(__dirname, "fixtures/sec");
const read = (f: string) => readFileSync(path.join(DIR, f), "utf8");
const CLASP: IndexEntry = { form: "D", company: "Clasp Legal Technologies, Inc.", cik: "2166745", filedDate: "2026-11-24", accession: "0002166745-26-000001", path: "edgar/data/2166745/0002166745-26-000001.txt" };

describe("EDGAR index", () => {
  it("parses Form D and D/A rows only", () => {
    const rows = parseDailyIndex(read("form.20261124.idx"));
    expect(rows.length).toBeGreaterThan(30);
    expect(rows.every((r) => r.form === "D" || r.form === "D/A")).toBe(true);
    expect(rows.find((r) => r.cik === "2166745")).toEqual(CLASP);
    expect(rows.some((r) => r.form === "D/A" && r.accession === "0002159613-26-000002")).toBe(true);
  });
  it("builds EDGAR URLs", () => {
    expect(dailyIndexUrl("2026-11-24")).toBe("https://www.sec.gov/Archives/edgar/daily-index/2026/QTR4/form.20261124.idx");
    expect(dailyIndexUrl("2026-02-03")).toContain("/2026/QTR1/form.20260203.idx");
    expect(primaryDocUrl(CLASP)).toBe("https://www.sec.gov/Archives/edgar/data/2166745/000216674526000001/primary_doc.xml");
  });
});

describe("Form D XML", () => {
  it("parses an operating company's SAFE round", () => {
    const f = parseFormD(read("0002166745-26-000001.xml"));
    expect(f).toMatchObject({
      submissionType: "D", cik: "2166745", name: "Clasp Legal Technologies, Inc.", entityType: "Corporation", yearOfInc: 2025,
      city: "NEWARK", stateOrCountry: "DE", industryGroup: "Other Technology", isAmendment: false, dateOfFirstSale: "2026-11-12",
      totalOfferingAmount: 200000, totalAmountSold: 200000, investorsCount: 1,
    });
    expect(f.securities).toEqual(["Other", "Simple Agreement for Future Equity (SAFE)"]);
    expect(f.relatedPersons.map((p) => p.title)).toEqual(["Chief Executive Officer", "Chief Technology Officer"]);
    expect(location(f)).toEqual({ city: "Newark", state: "DE", country: "United States", region: "North America" });
    expect(classify(f)).toEqual({ kind: "company", roundType: "Pre-seed", growthStage: "Pre-seed / Seed" });
  });
  it("parses a venture fund amendment", () => {
    const f = parseFormD(read("0002159613-26-000002.xml"));
    expect(f).toMatchObject({ submissionType: "D/A", isAmendment: true, previousAccession: "0002159613-26-000001", fundType: "Venture Capital Fund", totalAmountSold: 32850000 });
    expect(classify(f)).toEqual({ kind: "fund", investorType: "VC" });
  });
  it("skips vehicles, real estate, unsold offerings; infers stage from amount", () => {
    const base = parseFormD(read("0002166745-26-000001.xml"));
    expect(classify({ ...base, name: "7000 McGregor LP" }).kind).toBe("skip");
    expect(classify({ ...base, industryGroup: "Residential" })).toEqual({ kind: "skip", reason: "industry Residential" });
    expect(classify({ ...base, totalAmountSold: 0 }).kind).toBe("skip");
    expect(classify({ ...base, totalAmountSold: 12_000_000 })).toMatchObject({ roundType: "Series A" });
    expect(classify({ ...base, securities: ["Debt"] })).toMatchObject({ roundType: "Debt" });
    expect(classify({ ...base, industryGroup: "Pooled Investment Fund", fundType: "Hedge Fund" }).kind).toBe("skip");
    expect(() => parseFormD("<html/>")).toThrow();
  });
  it("treats 'Indefinite' amounts as unknown and decodes entities", () => {
    const f = parseFormD(read("0002166745-26-000001.xml").replace("<totalOfferingAmount>200000", "<totalOfferingAmount>Indefinite").replace("Clasp Legal Technologies, Inc.</entityName>", "Clasp &amp; Co</entityName>"));
    expect(f.totalOfferingAmount).toBeNull();
    expect(f.name).toBe("Clasp & Co");
  });
});

let dbUp = false;
const ACC = ["0002166745-26-000001", "0002166745-26-000002", "0002159613-26-000002"];
async function cleanup() {
  const s = getSql();
  const rows = (await s`SELECT company_id, investor_id FROM sec_filings WHERE cik IN ('2166745', '2159613')`) as unknown as { company_id: string | null; investor_id: string | null }[];
  const cos = rows.map((r) => r.company_id).filter((x): x is string => !!x);
  const invs = rows.map((r) => r.investor_id).filter((x): x is string => !!x);
  await s`DELETE FROM funding_rounds WHERE company_id = ANY(${cos})`;
  await s`DELETE FROM outbox_events WHERE entity_id = ANY(${cos})`;
  await s`DELETE FROM companies WHERE id = ANY(${cos}) OR domain = 'claspexisting.test'`;
  await s`DELETE FROM investors WHERE id = ANY(${invs})`;
  await s`DELETE FROM sec_filings WHERE cik IN ('2166745', '2159613') OR accession = ANY(${ACC})`;
}

beforeAll(async () => {
  try {
    await getSql()`SELECT 1 FROM sec_filings LIMIT 1`;
    dbUp = true;
    await cleanup();
  } catch {
    /* no database: unit tests above still run */
  }
});
afterAll(async () => {
  if (dbUp) await cleanup();
  await getSql().end({ timeout: 1 });
});

describe("ingest", () => {
  it("creates a company + round with provenance from the fixture day; funds become investors; re-runs are no-ops", async () => {
    if (!dbUp) return;
    const counts: Record<string, number> = {};
    const ctx = { count: (k: string, n = 1) => void (counts[k] = (counts[k] ?? 0) + n), log: () => {} };
    await runSecFormD(new SecClient(fixtureFetcher(DIR), 0), ["2026-11-24"], ctx);
    expect(counts.company).toBe(1);
    expect(counts.fund).toBe(1);
    expect(counts.fetch_failed).toBeGreaterThan(0); // the other index rows have no fixture XML

    const s = getSql();
    const [co] = (await s`SELECT c.* FROM companies c JOIN sec_filings f ON f.company_id = c.id WHERE f.accession = ${ACC[0]}`) as unknown as Record<string, unknown>[];
    expect(co).toMatchObject({ name: "Clasp Legal Technologies, Inc.", domain: "cik2166745.sec.invalid", hq_city: "Newark", hq_country: "United States", founded_year: 2025,
      growth_stage: "Pre-seed / Seed", round_count: 1, last_funding_type: "Pre-seed" });
    expect(Number(co?.total_funding_usd)).toBe(200000);
    expect((co?.provenance as Record<string, { source: string; redistributable: boolean }>).name).toMatchObject({ source: "sec_form_d", redistributable: true });
    const [round] = (await s`SELECT * FROM funding_rounds WHERE company_id = ${co!.id as string}`) as unknown as Record<string, unknown>[];
    expect(String(round?.announced_date instanceof Date ? (round.announced_date as Date).toISOString().slice(0, 10) : round?.announced_date)).toBe("2026-11-12");
    expect((round?.source_urls as string[])[0]).toContain("0002166745-26-000001-index.htm");
    expect((round?.provenance as Record<string, { inferred?: string }>).type?.inferred).toBeTruthy();
    const [inv] = (await s`SELECT i.name, i.type, i.hq_country FROM investors i JOIN sec_filings f ON f.investor_id = i.id WHERE f.accession = ${ACC[2]}`) as unknown as Record<string, unknown>[];
    expect(inv).toEqual({ name: "8VC BRSC, LLC", type: "VC", hq_country: "United States" });

    const again: Record<string, number> = {};
    await runSecFormD(new SecClient(fixtureFetcher(DIR), 0), ["2026-11-24"], { count: (k, n = 1) => void (again[k] = (again[k] ?? 0) + n), log: () => {} });
    expect(again.company ?? 0).toBe(0);
    expect(again.duplicate).toBe(2);
  });

  it("an amendment updates the original round instead of adding one", async () => {
    if (!dbUp) return;
    const f = parseFormD(read("0002166745-26-000001.xml"));
    const o = await ingestFiling({ ...CLASP, form: "D/A", accession: ACC[1]! }, { ...f, isAmendment: true, previousAccession: ACC[0]!, totalAmountSold: 1_500_000 });
    expect(o).toMatchObject({ outcome: "company", created: false });
    const rows = (await getSql()`SELECT type, amount_usd FROM funding_rounds WHERE company_id = ${o.companyId!}`) as unknown as { type: string; amount_usd: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "Seed" });
    expect(Number(rows[0]?.amount_usd)).toBe(1_500_000);
  });

  it("links a filing to an existing company that resolution is sure about", async () => {
    if (!dbUp) return;
    const s = getSql();
    await s`DELETE FROM sec_filings WHERE cik = '2166745'`;
    await s`INSERT INTO companies (id, name, domain, hq_city, hq_country, founded_year, growth_stage) VALUES ('com_secexisting0000000000001', 'Clasp Legal Technologies', 'claspexisting.test', 'Newark', 'United States', 2025, 'Pre-seed / Seed')`;
    await s`UPDATE companies SET deleted_at = now() WHERE domain = 'cik2166745.sec.invalid'`;
    const o = await ingestFiling(CLASP, parseFormD(read("0002166745-26-000001.xml")));
    expect(o).toMatchObject({ outcome: "company", created: false, companyId: "com_secexisting0000000000001" });
    await s`DELETE FROM funding_rounds WHERE company_id = 'com_secexisting0000000000001'`;
    await s`DELETE FROM companies WHERE id = 'com_secexisting0000000000001' OR domain = 'cik2166745.sec.invalid'`;
  });
});
