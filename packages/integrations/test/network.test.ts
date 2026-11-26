import { describe, expect, it } from "vitest";
import {
  CsvFormatError,
  aggregate,
  csvSafe,
  externalOnly,
  liveMailSource,
  parseAddresses,
  parseConnectedOn,
  parseCsv,
  parseLinkedinConnections,
  strength,
  strengthLabel,
} from "../src/network";
import type { HttpRequest, Transport } from "../src/crm";

const EXPORT = `Notes:
"When exporting your connection data, you may notice that some of the email addresses are missing."

First Name,Last Name,URL,Email Address,Company,Position,Connected On
Mara,Quispe,https://www.linkedin.com/in/mara-quispe,,Andes Pay,"CEO, co-founder",05 Mar 2024
Tomás,Ibáñez,https://www.linkedin.com/in/tomas-ibanez/,tomas@salar.example,Salar Energy,CTO,17 Nov 2019
,,,,,,
`;

describe("csv", () => {
  it("parses quotes, escaped quotes and CRLF", () => {
    expect(parseCsv('a,"b ""q"", c"\r\n1,2\n')).toEqual([
      ["a", 'b "q", c'],
      ["1", "2"],
    ]);
  });
  it("guards formula injection on export", () => {
    expect(csvSafe("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvSafe("-5")).toBe("'-5");
    expect(csvSafe('a,"b"')).toBe('"a,""b"""');
    expect(csvSafe(null)).toBe("");
  });
});

describe("LinkedIn export", () => {
  it("skips the notes preamble and normalises rows", () => {
    const rows = parseLinkedinConnections(EXPORT);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ first: "Mara", last: "Quispe", linkedinUrl: "linkedin.com/in/mara-quispe", email: null, company: "Andes Pay", position: "CEO, co-founder", connectedOn: "2024-03-05" });
    expect(rows[1]?.email).toBe("tomas@salar.example");
    expect(parseConnectedOn("17 Nov 2019")).toBe("2019-11-17");
    expect(parseConnectedOn("")).toBeNull();
  });
  it("rejects files that are not the connections export", () => {
    expect(() => parseLinkedinConnections("name,email\na,b")).toThrow(CsvFormatError);
  });
});

describe("strength", () => {
  const now = new Date("2026-11-26T00:00:00Z");
  it("recent meetings beat an old LinkedIn connection; recency decays", () => {
    const old = strength({ LINKEDIN: { count: 1, last: "2019-01-01" } }, now);
    const meetings = strength({ MEETING: { count: 6, last: "2026-11-20" }, EMAIL: { count: 20, last: "2026-11-25" } }, now);
    const stale = strength({ MEETING: { count: 6, last: "2024-11-20" }, EMAIL: { count: 20, last: "2024-11-25" } }, now);
    expect(old).toBeLessThan(15);
    expect(meetings).toBeGreaterThan(70);
    expect(stale).toBeLessThan(meetings);
    expect(strengthLabel(meetings)).toBe("strong");
    expect(strength({}, now)).toBe(0);
    expect(meetings).toBeLessThanOrEqual(100);
  });
});

describe("mail metadata", () => {
  it("parses address headers and drops internal / automated senders", () => {
    expect(parseAddresses('"Rojas, Ana" <Ana@Andes.example>, bob@x.example, nope')).toEqual([
      { name: "Rojas, Ana", email: "ana@andes.example" },
      { name: null, email: "bob@x.example" },
    ]);
    const items = externalOnly(
      [
        { email: "ana@andes.example", name: null, at: "2026-01-01T00:00:00Z", channel: "EMAIL" },
        { email: "me@ourfund.example", name: null, at: "2026-01-01T00:00:00Z", channel: "EMAIL" },
        { email: "no-reply@andes.example", name: null, at: "2026-01-01T00:00:00Z", channel: "EMAIL" },
      ],
      ["ourfund.example"],
    );
    expect(items.map((i) => i.email)).toEqual(["ana@andes.example"]);
    const agg = aggregate([
      { email: "a@x.example", name: "A", at: "2026-01-01T00:00:00Z", channel: "EMAIL" },
      { email: "a@x.example", name: null, at: "2026-02-01T00:00:00Z", channel: "EMAIL" },
      { email: "a@x.example", name: null, at: "2026-01-15T00:00:00Z", channel: "MEETING" },
    ]);
    expect(agg.get("a@x.example")).toEqual({ name: "A", EMAIL: { count: 2, last: "2026-02-01T00:00:00Z" }, MEETING: { count: 1, last: "2026-01-15T00:00:00Z" } });
  });

  it("Gmail asks for metadata headers only, never bodies", async () => {
    const calls: HttpRequest[] = [];
    const t: Transport = async (req) => {
      calls.push(req);
      if (req.url.includes("/messages?")) return { status: 200, body: JSON.stringify({ messages: [{ id: "m1" }], nextPageToken: "p2" }) };
      return { status: 200, body: JSON.stringify({ internalDate: "1767225600000", payload: { headers: [{ name: "From", value: "Ana <ana@andes.example>" }, { name: "To", value: "me@ourfund.example" }] } }) };
    };
    const page = await liveMailSource("GMAIL", "tok", t).list("2026-01-01T00:00:00Z", null);
    expect(page.next).toBe("p2");
    expect(page.items.map((i) => i.email)).toEqual(["ana@andes.example", "me@ourfund.example"]);
    expect(calls[1]?.url).toContain("format=metadata");
    expect(calls.every((c) => !/format=(full|raw)/.test(c.url) && c.headers.authorization === "Bearer tok")).toBe(true);
  });

  it("Graph next links are only followed on graph.microsoft.com", async () => {
    const t: Transport = async () => ({ status: 200, body: JSON.stringify({ value: [], "@odata.nextLink": "https://evil.example/next" }) });
    expect((await liveMailSource("OUTLOOK", "tok", t).list("2026-01-01T00:00:00Z", null)).next).toBeNull();
  });
});
