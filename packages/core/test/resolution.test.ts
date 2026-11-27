/** Plan 9.1 entity resolution: canonical keys and Fellegi–Sunter decisions (D-072). */
import { describe, expect, it } from "vitest";
import {
  canonicalDomain, canonicalLinkedIn, decide, explain, jaroWinkler, normalizeCompanyName, normalizePersonName, registrableLabel,
  scoreCompanies, scorePeople,
} from "../src/resolution";

describe("canonical keys", () => {
  it("canonicalises domains and rejects platform hosts", () => {
    expect(canonicalDomain("https://www.Acme.com/about?x=1")).toBe("acme.com");
    expect(canonicalDomain("http://user@acme.com.bo:8080/")).toBe("acme.com.bo");
    expect(canonicalDomain("acme.io.")).toBe("acme.io");
    expect(canonicalDomain("https://linkedin.com/company/acme")).toBeNull();
    expect(canonicalDomain("not a domain")).toBeNull();
    expect(canonicalDomain("")).toBeNull();
    expect(canonicalDomain("cik2166745.sec.invalid")).toBeNull();
  });
  it("finds the registrable label across country suffixes", () => {
    expect(registrableLabel("acme.com.bo")).toBe("acme");
    expect(registrableLabel("app.acme.io")).toBe("acme");
    expect(registrableLabel("acme.co.uk")).toBe("acme");
  });
  it("canonicalises LinkedIn URLs", () => {
    expect(canonicalLinkedIn("https://www.linkedin.com/company/Acme-Pagos/?trk=x")).toBe("linkedin.com/company/acme-pagos");
    expect(canonicalLinkedIn("es.linkedin.com/in/jos%C3%A9-p")).toBe("linkedin.com/in/josé-p");
    expect(canonicalLinkedIn("https://acme.com")).toBeNull();
  });
  it("normalises company names without losing identifying words", () => {
    expect(normalizeCompanyName("Acme Pagos S.A. de C.V.")).toBe("acme pagos");
    expect(normalizeCompanyName("The Nova Company, Inc.")).toBe("nova");
    expect(normalizeCompanyName("Café & Co Ltda")).toBe("cafe and");
    expect(normalizeCompanyName("Inc")).toBe("inc");
  });
  it("normalises person names", () => {
    expect(normalizePersonName("Dr. José  Pérez-Gómez, MBA")).toBe("jose perez gomez");
    expect(normalizePersonName("Ana Ruiz Jr.")).toBe("ana ruiz");
  });
  it("computes Jaro–Winkler", () => {
    expect(jaroWinkler("martha", "marhta")).toBeCloseTo(0.961, 3);
    expect(jaroWinkler("abc", "abc")).toBe(1);
    expect(jaroWinkler("", "abc")).toBe(0);
  });
});

describe("company matching", () => {
  const base = { id: "com_a", name: "Acme Pagos S.A.", domain: "acme.com.bo", hqCountry: "Bolivia", hqCity: "Santa Cruz", foundedYear: 2019 };

  it("auto-merges a shared domain with agreeing details", () => {
    const s = scoreCompanies(base, { id: "com_b", name: "ACME Pagos", domain: "https://www.acme.com.bo", hqCountry: "Bolivia", hqCity: "Santa Cruz", foundedYear: 2019 });
    expect(s.hardKey).toBe(true);
    expect(decide(s)).toBe("auto_merge");
    expect(explain(s)).toMatch(/^domain same/);
  });

  it("matches through a domain alias", () => {
    const s = scoreCompanies({ ...base, domainAliases: ["acmepagos.com"] }, { id: "com_b", name: "Acme Pagos", domain: "acmepagos.com", hqCountry: "Bolivia" });
    expect(decide(s)).toBe("auto_merge");
  });

  it("queues same-name, same-city companies without a shared key for review", () => {
    const s = scoreCompanies(base, { id: "com_b", name: "Acme Pagos", domain: "acme.com", hqCountry: "Bolivia", hqCity: "Santa Cruz", foundedYear: 2019 });
    expect(s.hardKey).toBe(false);
    expect(decide(s)).toBe("review");
  });

  it("never auto-merges on name alone", () => {
    const s = scoreCompanies({ id: "com_a", name: "Nova Pay" }, { id: "com_b", name: "Nova Pay" }, 0.95);
    expect(decide(s)).not.toBe("auto_merge");
  });

  it("ignores same-name companies in different countries with different domains", () => {
    const s = scoreCompanies(
      { id: "com_a", name: "Nova Pay", domain: "novapay.mx", hqCountry: "Mexico", foundedYear: 2015 },
      { id: "com_b", name: "Nova Pay", domain: "nova-pay.de", hqCountry: "Germany", foundedYear: 2021 },
    );
    expect(decide(s)).toBe("ignore");
  });

  it("treats different LinkedIn pages as evidence against (never auto-merged)", () => {
    const a = { ...base, linkedin: "linkedin.com/company/acme-pagos" };
    const same = scoreCompanies(a, { ...base, id: "com_b", domain: "acme.com", linkedin: "https://www.linkedin.com/company/acme-pagos/" });
    const diff = scoreCompanies(a, { ...base, id: "com_b", domain: "acme.com", linkedin: "https://www.linkedin.com/company/other" });
    expect(decide(same)).toBe("auto_merge");
    expect(diff.probability).toBeLessThan(same.probability);
    expect(decide(diff)).not.toBe("auto_merge");
  });
});

describe("person matching", () => {
  it("auto-merges on a shared LinkedIn profile", () => {
    const s = scorePeople(
      { id: "per_a", fullName: "José Pérez", linkedin: "https://linkedin.com/in/jose-perez", currentCompanyId: "com_x", country: "Bolivia" },
      { id: "per_b", fullName: "Jose Perez", linkedin: "linkedin.com/in/jose-perez/", currentCompanyId: "com_x", country: "Bolivia" },
    );
    expect(decide(s)).toBe("auto_merge");
  });

  it("auto-merges on a shared e-mail", () => {
    const s = scorePeople(
      { id: "per_a", fullName: "Ana Ruiz", emails: ["ana@acme.com"], currentCompanyId: "com_x" },
      { id: "per_b", fullName: "Ana Ruiz", emails: ["ANA@acme.com"], currentCompanyId: "com_x" },
    );
    expect(decide(s)).toBe("auto_merge");
  });

  it("reviews same name at the same company without a hard key", () => {
    const s = scorePeople(
      { id: "per_a", fullName: "Ana Ruiz", currentCompanyId: "com_x", country: "Bolivia", title: "CTO" },
      { id: "per_b", fullName: "Ana Ruíz", currentCompanyId: "com_x", country: "Bolivia", title: "CTO" },
    );
    expect(decide(s)).toBe("review");
  });

  it("ignores namesakes at different companies and countries", () => {
    const s = scorePeople(
      { id: "per_a", fullName: "Juan Garcia", currentCompanyId: "com_x", country: "Mexico" },
      { id: "per_b", fullName: "Juan Garcia", currentCompanyId: "com_y", country: "Spain" },
    );
    expect(decide(s)).toBe("ignore");
  });
});
