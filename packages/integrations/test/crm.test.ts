/**
 * Plan 15 Phase 8 acceptance: "round-trip sync test per CRM sandbox". For each of the six providers:
 * seed a sandbox book in the vendor's native shapes → pull through the adapter → push new and
 * existing records → pull again and check create-vs-update, field mapping and no duplicates.
 */
import { describe, expect, it } from "vitest";
import {
  CRM_PROVIDERS,
  CrmHttpError,
  MemorySandboxStore,
  SPECS,
  createAdapter,
  liveClient,
  normDomain,
  normLinkedin,
  sandboxClient,
  seedSandbox,
  type CrmKind,
  type CrmRecord,
  type HttpRequest,
  type Transport,
} from "../src/crm";

const SEED = {
  companies: [
    { name: "Andes Pay", domain: "andespay.example" },
    { name: "Chiquitano Labs", domain: "chiquitano.example" },
    { name: "Salar Energy", domain: "salar-energy.example" },
  ],
  people: [
    { name: "Mara Quispe", linkedinUrl: "linkedin.invalid/in/mara-quispe", companyDomain: "andespay.example" },
    { name: "Tomás Ibáñez", linkedinUrl: "linkedin.invalid/in/tomas-ibanez", companyDomain: "salar-energy.example" },
  ],
  extraCompanies: 2,
};

async function pullAll(adapter: ReturnType<typeof createAdapter>, kind: CrmKind) {
  const out: CrmRecord[] = [];
  let cursor: string | null = null;
  do {
    const page = await adapter.pull(kind, cursor, 2);
    out.push(...page.records);
    cursor = page.next;
  } while (cursor);
  return out;
}

describe("normalisers", () => {
  it("canonicalises domains and LinkedIn URLs", () => {
    expect(normDomain("https://www.Andes-Pay.com/about?x=1")).toBe("andes-pay.com");
    expect(normDomain("not a domain")).toBeNull();
    expect(normLinkedin("https://www.linkedin.com/in/Mara-Quispe/?trk=x")).toBe("linkedin.com/in/mara-quispe");
    expect(normLinkedin("linkedin.invalid/company/andes")).toBe("linkedin.invalid/company/andes");
    expect(normLinkedin("https://example.com/in/x")).toBeNull();
  });
});

describe.each(CRM_PROVIDERS)("%s sandbox round trip", (provider) => {
  it("pulls the seeded book in native shapes and normalises it", async () => {
    const store = new MemorySandboxStore();
    const seeded = await seedSandbox(provider, store, SEED);
    expect(seeded.companies).toBe(5);
    const adapter = createAdapter(provider, sandboxClient(provider, store));
    expect((await adapter.connect()).account).toContain("sandbox");
    expect(adapter.listObjects().map((o) => o.kind)).toEqual(["COMPANY", "PERSON", "DEAL"]);

    const companies = await pullAll(adapter, "COMPANY");
    expect(companies).toHaveLength(5);
    expect(companies.map((c) => c.domain)).toEqual(expect.arrayContaining(["andespay.example", "chiquitano.example", "salar-energy.example"]));
    const andes = companies.find((c) => c.domain === "andespay.example") as CrmRecord;
    expect(andes.name).toBe("Andes Pay");
    expect(andes.owner).toBeTruthy();
    expect(andes.lastActivity).toBeTruthy();

    const people = await pullAll(adapter, "PERSON");
    const mara = people.find((p) => p.linkedinUrl === "linkedin.invalid/in/mara-quispe") as CrmRecord;
    expect(mara.name).toBe("Mara Quispe");
    expect(mara.companyExternalId).toBe(andes.externalId);

    const deals = await pullAll(adapter, "DEAL");
    expect(deals.length).toBe(seeded.deals);
    expect(deals.every((d) => d.companyExternalId)).toBe(true);
    expect(deals.some((d) => d.open === true)).toBe(true);
  });

  it("pushes: updates by dedupe key, creates new, writes mapped fields, never duplicates", async () => {
    const store = new MemorySandboxStore();
    await seedSandbox(provider, store, SEED);
    const adapter = createAdapter(provider, sandboxClient(provider, store));

    const res = await adapter.push(
      "COMPANY",
      [
        { key: "andespay.example", values: { name: "Andes Pay", domain: "andespay.example", employee_count: 84, rank: 1201, profile_url: "https://app/x" } },
        { key: "nuevo.example", values: { name: "Nuevo Co", domain: "nuevo.example", growth_stage: "Seed" }, owner: "owner-1" },
      ],
      {},
    );
    expect(res.map((r) => [r.key, r.created])).toEqual([
      ["andespay.example", false],
      ["nuevo.example", true],
    ]);
    expect(res.every((r) => r.externalId && !r.error)).toBe(true);

    // Second push of the same records only updates.
    const again = await adapter.push("COMPANY", [{ key: "nuevo.example", values: { name: "Nuevo Co", domain: "nuevo.example", rank: 99 } }]);
    expect(again[0]?.created).toBe(false);
    expect(again[0]?.externalId).toBe(res[1]?.externalId);

    const companies = await pullAll(adapter, "COMPANY");
    expect(companies).toHaveLength(6);
    expect(new Set(companies.map((c) => c.externalId)).size).toBe(6);
    const andes = companies.find((c) => c.domain === "andespay.example") as CrmRecord;
    expect(andes.name).toBe("Andes Pay"); // existing fields survive the merge
    const map = SPECS[provider].defaultFieldMap.COMPANY;
    expect(JSON.stringify(andes.raw)).toContain(map.rank as string);
    expect(JSON.stringify(andes.raw)).toContain("1201");

    const people = await adapter.push("PERSON", [
      { key: "linkedin.invalid/in/mara-quispe", values: { first: "Mara", last: "Quispe", linkedin_url: "https://linkedin.invalid/in/mara-quispe", title: "CEO" } },
      { key: "linkedin.invalid/in/new-person", values: { first: "New", last: "Person", linkedin_url: "https://linkedin.invalid/in/new-person" } },
    ]);
    expect(people.map((p) => p.created)).toEqual([false, true]);
    expect(await pullAll(adapter, "PERSON")).toHaveLength(3);
  });

  it("custom field maps are honoured but the dedupe key is always written", async () => {
    const store = new MemorySandboxStore();
    const adapter = createAdapter(provider, sandboxClient(provider, store));
    await adapter.push("COMPANY", [{ key: "x.example", values: { name: "X", domain: "x.example", tagline: "hello" } }], { tagline: "My_Custom_Tagline", domain: "" });
    const [rec] = await pullAll(adapter, "COMPANY");
    expect(rec?.domain).toBe("x.example");
    expect(JSON.stringify(rec?.raw)).toContain("My_Custom_Tagline");
  });
});

describe("live clients", () => {
  function recorder(responses: (req: HttpRequest) => { status: number; body: unknown }) {
    const calls: HttpRequest[] = [];
    const transport: Transport = async (req) => {
      calls.push(req);
      const r = responses(req);
      return { status: r.status, body: JSON.stringify(r.body) };
    };
    return { calls, transport };
  }

  it("HubSpot: lists with cursor, searches then patches an existing record", async () => {
    const { calls, transport } = recorder((req) => {
      if (req.url.includes("/search")) return { status: 200, body: { results: [{ id: "77", properties: { domain: "andespay.example" } }] } };
      if (req.method === "GET") return { status: 200, body: { results: [{ id: "1", properties: { name: "A", domain: "a.example" } }], paging: { next: { after: "abc" } } } };
      return { status: 200, body: { id: "77" } };
    });
    const adapter = createAdapter("HUBSPOT", liveClient("HUBSPOT", { token: "tok" }, transport));
    const page = await adapter.pull("COMPANY", null, 10);
    expect(page.next).toBe("abc");
    expect(page.records[0]?.domain).toBe("a.example");
    const res = await adapter.push("COMPANY", [{ key: "andespay.example", values: { name: "Andes", domain: "andespay.example" } }]);
    expect(res[0]).toMatchObject({ externalId: "77", created: false });
    expect(calls.every((c) => c.url.startsWith("https://api.hubapi.com/") && c.headers.authorization === "Bearer tok")).toBe(true);
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch?.url).toContain("/crm/v3/objects/companies/77");
    expect(JSON.parse(patch?.body ?? "{}").properties.domain).toBe("andespay.example");
  });

  it("creates when the fuzzy search hit does not match the key exactly", async () => {
    const { calls, transport } = recorder((req) => {
      if (req.url.includes("/search")) return { status: 200, body: { data: { items: [{ item: { id: 5, website: "andespay.example.org" } }] } } };
      return { status: 201, body: { data: { id: 42 } } };
    });
    const res = await createAdapter("PIPEDRIVE", liveClient("PIPEDRIVE", { token: "t" }, transport)).push("COMPANY", [{ key: "andespay.example", values: { name: "A", domain: "andespay.example" } }]);
    expect(res[0]).toMatchObject({ externalId: "42", created: true });
    expect(calls.at(-1)?.method).toBe("POST");
    expect(calls.at(-1)?.headers["x-api-token"]).toBe("t");
  });

  it("an auth failure aborts the push; other errors are reported per record", async () => {
    const denied = recorder(() => ({ status: 401, body: {} }));
    await expect(createAdapter("ATTIO", liveClient("ATTIO", { token: "bad" }, denied.transport)).push("COMPANY", [{ key: "a.example", values: { domain: "a.example" } }])).rejects.toBeInstanceOf(CrmHttpError);
    const flaky = recorder((req) => (req.method === "POST" && !req.url.includes("query") ? { status: 422, body: { message: "Invalid attribute" } } : { status: 200, body: { data: [] } }));
    const res = await createAdapter("ATTIO", liveClient("ATTIO", { token: "ok" }, flaky.transport)).push("COMPANY", [{ key: "a.example", values: { domain: "a.example" } }]);
    expect(res[0]?.error).toBe("Invalid attribute");
  });

  it("Salesforce needs an instance URL; Airtable needs a base id; requests stay on vendor hosts", async () => {
    const { transport, calls } = recorder(() => ({ status: 200, body: { records: [], done: true } }));
    expect(() => liveClient("SALESFORCE", { token: "t" }, transport)).toThrow(/instance URL/);
    expect(() => liveClient("AIRTABLE", { token: "t" }, transport)).toThrow(/base id/);
    await createAdapter("SALESFORCE", liveClient("SALESFORCE", { token: "t", instanceUrl: "https://acme.my.salesforce.com" }, transport)).pull("COMPANY", null);
    await createAdapter("AIRTABLE", liveClient("AIRTABLE", { token: "t", baseId: "appX" }, transport)).pull("DEAL", null);
    await createAdapter("AFFINITY", liveClient("AFFINITY", { token: "t" }, transport)).pull("PERSON", null);
    expect(calls.map((c) => new URL(c.url).hostname)).toEqual(["acme.my.salesforce.com", "api.airtable.com", "api.affinity.co"]);
    expect(calls[0]?.url).toContain("FROM%20Account");
    expect(calls[2]?.headers.authorization).toBe(`Basic ${Buffer.from(":t").toString("base64")}`);
  });
});
