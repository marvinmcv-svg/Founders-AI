import { describe, expect, it } from "vitest";
import {
  buildFacts,
  detectTalentSignal,
  scoreTalentSignal,
  summaryIsGrounded,
  templateSummary,
  type PersonSnapshot,
  type Role,
} from "../src/signals/talent";

const today = new Date("2026-11-26T00:00:00Z");
const ctx = { breakoutCompanyIds: new Set(["com_breakout"]), today };
const r = (o: Partial<Role>): Role => ({ companyId: "com_a", companyName: "Acme", title: "Engineer", seniority: "IC", isFounder: false, start: "2022-01-01", companyFoundedYear: 2015, ...o });
const snap = (current: Role[], headline: string | null = null): PersonSnapshot => ({ headline, current });

describe("talent detector", () => {
  it("NEW_COMPANY (stealth)", () => {
    const d = detectTalentSignal(snap([r({})]), snap([r({ companyId: null, companyName: "Stealth Startup", title: "Co-founder", seniority: "Founder", isFounder: true, companyFoundedYear: null })]), ctx);
    expect(d).toMatchObject({ type: "NEW_COMPANY", status: "STEALTH", newCompanyId: null, prevCompanyIds: ["com_a"] });
  });
  it("NEW_COMPANY (live, < 12 months old)", () => {
    const d = detectTalentSignal(snap([r({})]), snap([r({ companyId: "com_new", companyName: "Newco", title: "Co-founder & CEO", seniority: "Founder", isFounder: true, companyFoundedYear: 2026 })]), ctx);
    expect(d).toMatchObject({ type: "NEW_COMPANY", status: "LIVE", newCompanyId: "com_new" });
  });
  it("a founder title at an old company is a NEW_ROLE-like move, not NEW_COMPANY", () => {
    const d = detectTalentSignal(snap([r({})]), snap([r({ companyId: "com_old", companyName: "Oldco", title: "Founder", isFounder: true, companyFoundedYear: 2010 })]), ctx);
    expect(d?.type).not.toBe("NEW_COMPANY");
  });
  it("OUT_OF_STEALTH beats NEW_COMPANY", () => {
    const before = snap([r({ companyId: null, companyName: "Stealth Startup", title: "Co-founder", seniority: "Founder", isFounder: true, companyFoundedYear: null })]);
    const after = snap([r({ companyId: "com_new", companyName: "Newco", title: "Co-founder", seniority: "Founder", isFounder: true, companyFoundedYear: 2026 })]);
    expect(detectTalentSignal(before, after, ctx)).toMatchObject({ type: "OUT_OF_STEALTH", newCompanyId: "com_new" });
  });
  it("PROMOTION needs a seniority step up and a new title", () => {
    expect(detectTalentSignal(snap([r({ seniority: "Manager", title: "Sales Manager" })]), snap([r({ seniority: "Director", title: "Director of Sales" })]), ctx)?.type).toBe("PROMOTION");
    expect(detectTalentSignal(snap([r({ seniority: "Senior IC", title: "Senior Engineer" })]), snap([r({ seniority: "Senior IC", title: "Sr. Engineer" })]), ctx)).toBeNull();
  });
  it("DEPARTURE only from tracked breakout companies", () => {
    expect(detectTalentSignal(snap([r({ companyId: "com_breakout", companyName: "Rocket" })]), snap([]), ctx)).toMatchObject({ type: "DEPARTURE", status: "HR" });
    expect(detectTalentSignal(snap([r({})]), snap([]), ctx)).toMatchObject({ type: "SEARCHING", status: "HR" });
  });
  it("NEW_ROLE when moving companies", () => {
    expect(detectTalentSignal(snap([r({})]), snap([r({ companyId: "com_b", companyName: "Beta", title: "Head of Sales", seniority: "Director" })]), ctx)).toMatchObject({ type: "NEW_ROLE", newCompanyId: "com_b" });
  });
  it("ignores side projects, advisory roles, overlapping roles and headline tweaks", () => {
    const base = snap([r({})]);
    expect(detectTalentSignal(base, snap([r({}), r({ companyId: null, companyName: "Builders", title: "Founder, Product Community SCZ", seniority: null, companyFoundedYear: 2026 })]), ctx)).toBeNull();
    expect(detectTalentSignal(base, snap([r({}), r({ companyId: null, companyName: "X", title: "Advisor", seniority: null })]), ctx)).toBeNull();
    expect(detectTalentSignal(base, snap([r({}), r({ companyId: "com_b", companyName: "Beta", title: "PM", seniority: "Manager" })]), ctx)).toBeNull();
    expect(detectTalentSignal(snap([r({})], "Engineer"), snap([r({})], "Engineer | Speaker"), ctx)).toBeNull();
  });
});

describe("talent score", () => {
  const f = { priorExit: false, priorIpo: false, serialFounder: false, majorEmployer: false, topUniversity: false, seniorityRank: 1, yearsExperience: 3, connectionsPct: 0.3, type: "NEW_ROLE" as const, daysSinceSignal: 0 };
  it("is 1–10, monotonic in founder quality, explainable", () => {
    const weak = scoreTalentSignal(f);
    const strong = scoreTalentSignal({ ...f, priorExit: true, serialFounder: true, seniorityRank: 7, type: "NEW_COMPANY", connectionsPct: 0.95 });
    expect(weak.score).toBeGreaterThanOrEqual(1);
    expect(strong.score).toBeLessThanOrEqual(10);
    expect(strong.score).toBeGreaterThan(weak.score + 3);
    expect(strong.contributions.prior_exit).toBeGreaterThan(0);
  });
  it("decays with age", () => {
    expect(scoreTalentSignal({ ...f, daysSinceSignal: 0 }).probability).toBeGreaterThan(scoreTalentSignal({ ...f, daysSinceSignal: 365 }).probability);
  });
});

describe("talent summary", () => {
  const d = detectTalentSignal(snap([r({ title: "VP Engineering", seniority: "VP", start: "2020-11-01" })]), snap([r({ companyId: null, companyName: "Stealth Startup", title: "Co-founder", seniority: "Founder", isFounder: true, companyFoundedYear: null })]), ctx);
  const facts = buildFacts("Ana Rojas", d!, { vertical: null, highlights: ["Serial Founder"], today });
  it("template uses only facts and never names a stealth company", () => {
    const s = templateSummary(facts);
    expect(s).toBe("Ana Rojas is building a stealth company, previously VP Engineering at Acme. Highlights: serial founder.");
    expect(summaryIsGrounded(s, facts)).toBe(true);
  });
  it("rejects LLM text with invented numbers or names", () => {
    expect(summaryIsGrounded("Ana Rojas raised $5M for a stealth company.", facts)).toBe(false);
    expect(summaryIsGrounded("Ana Rojas, ex-Google, is building a stealth company.", facts)).toBe(false);
    expect(summaryIsGrounded("Ana Rojas left Acme after 6 years to start a stealth company.", facts)).toBe(true);
  });
});
