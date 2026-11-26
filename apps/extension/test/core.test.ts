import { describe, expect, it } from "vitest";
import { ApiError, client, companyCard, personCard, targetFromUrl, type Fetcher } from "../src/core";

describe("targetFromUrl", () => {
  it("maps sites to companies, LinkedIn profiles to people, and skips platforms", () => {
    expect(targetFromUrl("https://www.andespay.com/pricing?x=1")).toEqual({ kind: "company", domain: "andespay.com" });
    expect(targetFromUrl("https://www.linkedin.com/in/Mara-Quispe/details")).toEqual({ kind: "person", linkedinUrl: "https://www.linkedin.com/in/mara-quispe" });
    expect(targetFromUrl("https://www.linkedin.com/company/andes-pay/")).toEqual({ kind: "linkedin_company", slug: "andes-pay" });
    expect(targetFromUrl("https://www.linkedin.com/feed/").kind).toBe("none");
    for (const u of ["https://www.google.com/search?q=x", "https://github.com/acme", "chrome://extensions", "http://192.168.1.1/", undefined]) expect(targetFromUrl(u).kind).toBe("none");
  });
});

describe("client", () => {
  const calls: { url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } }[] = [];
  const fetcher: Fetcher = async (url, init) => {
    calls.push({ url, ...(init ? { init } : {}) });
    if (url.endsWith("/api/v1/companies")) return { status: 200, json: async () => ({ items: [{ input: {}, match: { id: "com_1", name: "Andes Pay" } }] }) };
    if (url.endsWith("/api/ext/push")) return { status: 409, json: async () => ({ error: "No CRM connected" }) };
    return { status: 401, json: async () => ({}) };
  };
  const api = client({ apiKey: "fai_x", appUrl: "https://app.example/" }, fetcher);

  it("looks up by domain with the key header and maps errors", async () => {
    expect((await api.lookupCompany("andespay.com"))?.name).toBe("Andes Pay");
    expect(calls[0]).toMatchObject({ url: "https://app.example/api/v1/companies", init: { method: "POST", headers: { "X-API-Key": "fai_x" } } });
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ items: [{ domain: "andespay.com" }] });
    await expect(api.push("com_1")).rejects.toThrow("No CRM connected");
    await expect(api.config()).rejects.toBeInstanceOf(ApiError);
  });
});

describe("cards", () => {
  it("builds the company card from the public company JSON", () => {
    const card = companyCard({
      id: "com_1",
      organization_name: "Andes Pay",
      tagline: "Payments for the Andes",
      organization_rank: 1234,
      hq: { city: "La Paz", country: "Bolivia" },
      founded_year: 2021,
      growth_stage: "Seed",
      business_models: ["SaaS", "Marketplace", "API"],
      employee_count: 42,
      traction_metrics: { employee_count: { "3mo": { percentage: 12.5 } } },
      funding: { total_funding_usd: 3_500_000, last_funding_type: "Seed", last_funding_usd: 2_000_000 },
      founders: [{ full_name: "Mara Quispe", title: "CEO" }],
    });
    expect(card.title).toBe("Andes Pay");
    expect(card.chips).toEqual(["Rank 1,234", "La Paz, Bolivia", "Founded 2021", "Seed", "SaaS", "Marketplace"]);
    expect(card.kpis[0]).toEqual({ label: "Team size", value: "42", delta: 12.5 });
    expect(card.kpis[1]?.value).toBe("$3.5M");
    expect(card.people).toEqual(["Mara Quispe · CEO"]);
    expect(card.appPath).toBe("/companies/com_1");
    expect(personCard({ id: "per_1", full_name: "Mara", current_title: "CEO", current_company: { name: "Andes Pay" } }).subtitle).toBe("CEO · Andes Pay");
  });
});
