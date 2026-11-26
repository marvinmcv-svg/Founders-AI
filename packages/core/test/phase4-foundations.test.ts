import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, maskUrl } from "../src/crypto";
import { EgressBlockedError, egressFetch, isBlockedAddress, validateEgressUrl } from "../src/egress";
import {
  companyHighlights,
  diffHighlights,
  investorHighlights,
  mergeHighlights,
  percentileRanks,
  personHighlights,
} from "../src/signals/highlights";

describe("egress proxy (SSRF)", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0",
    "224.0.0.1", "::1", "::", "fc00::1", "fd12::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "64:ff9b::a00:1",
  ])("blocks %s", (ip) => expect(isBlockedAddress(ip)).toBe(true));

  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111"])("allows public %s", (ip) => expect(isBlockedAddress(ip)).toBe(false));

  it.each([
    ["http://hooks.slack.com/x", "Only https"],
    ["ftp://example.com/x", "Only https"],
    ["file:///etc/passwd", "Only https"],
    ["https://user:pw@example.com/", "Credentials"],
    ["https://example.com:8443/", "Non-standard ports"],
    ["https://127.0.0.1/", "Private"],
    ["https://[::1]/", "Private"],
    ["https://localhost/", "Internal"],
    ["https://metadata.google.internal/", "Internal"],
    ["not a url", "Not a valid URL"],
  ])("rejects %s", (url, msg) => {
    expect(() => validateEgressUrl(url)).toThrow(msg);
  });

  it("enforces a host allowlist incl. subdomains", () => {
    expect(validateEgressUrl("https://hooks.slack.com/services/T/B/x", { allowHosts: ["slack.com"] }).hostname).toBe("hooks.slack.com");
    expect(() => validateEgressUrl("https://evil-slack.com/x", { allowHosts: ["slack.com"] })).toThrow("Host not allowed");
  });

  it("refuses hosts that resolve to private space (DNS rebinding guard)", async () => {
    await expect(egressFetch("https://attacker.example/x", {}, { resolve: async () => ["93.184.216.34", "10.0.0.5"] })).rejects.toBeInstanceOf(EgressBlockedError);
    await expect(egressFetch("https://attacker.example/x", {}, { resolve: async () => ["169.254.169.254"] })).rejects.toThrow("private or reserved");
  });
});

describe("secrets at rest", () => {
  it("round-trips and is non-deterministic", () => {
    process.env.BETTER_AUTH_SECRET ??= "test-secret-for-hkdf-derivation-only";
    const a = encryptSecret("https://hooks.slack.com/services/T000/B000/XXXX");
    const b = encryptSecret("https://hooks.slack.com/services/T000/B000/XXXX");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("https://hooks.slack.com/services/T000/B000/XXXX");
    const parts = a.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });
  it("masks webhook URLs", () => expect(maskUrl("https://hooks.slack.com/services/T000/B000/abcd1234")).toBe("https://hooks.slack.com/…1234"));
});

describe("highlights v2", () => {
  const base = {
    employeeCount: 40, headcountGrowth3m: 0, headcountGrowthStagePct: 0.5, webVisits: 5000, webVisitsGrowth3m: 0, socialGrowth3m: 0,
    hasTier1Investor: false, hasAccelerator: false, daysSinceLastRound: 400, bootstrapped: false,
  };
  it("surge beats strong growth; tiny teams never qualify", () => {
    expect(companyHighlights({ ...base, headcountGrowth3m: 0.3 })).toContain("headcount_surge");
    expect(companyHighlights({ ...base, headcountGrowth3m: 0.3 })).not.toContain("strong_headcount_growth");
    expect(companyHighlights({ ...base, employeeCount: 3, headcountGrowth3m: 1 })).not.toContain("headcount_surge");
  });
  it("strong growth requires both absolute growth and top stage percentile", () => {
    expect(companyHighlights({ ...base, headcountGrowth3m: 0.12, headcountGrowthStagePct: 0.9 })).toContain("strong_headcount_growth");
    expect(companyHighlights({ ...base, headcountGrowth3m: 0.12, headcountGrowthStagePct: 0.6 })).not.toContain("strong_headcount_growth");
  });
  it("funding recency and bootstrapped companies", () => {
    expect(companyHighlights({ ...base, daysSinceLastRound: 30 })).toContain("recently_funded");
    expect(companyHighlights({ ...base, daysSinceLastRound: null })).toContain("no_recent_funding");
    expect(companyHighlights({ ...base, daysSinceLastRound: null, bootstrapped: true })).not.toContain("no_recent_funding");
  });
  it("people rules", () => {
    const p = { founderRoles: 2, foundedAcquired: true, foundedIpo: false, majorEmployer: false, topUniversity: false, connectionsPct: 0.99, followersPct: 0.1, recentStealthSignal: false, repeatCofounder: false };
    expect(personHighlights(p)).toEqual(["Serial Founder", "Prior Exit", "Hyper Connector"]);
  });
  it("investor rules keep curated Tier-1", () => {
    expect(investorHighlights({ curatedTier1: true, leadsCount: 12, deals12m: 1, followOnRate: 0.5, maxPortfolioValuationUsd: 2e9 })).toEqual([
      "Tier-1", "Lead investor", "Unicorn backer", "High follow-on rate",
    ]);
  });
  it("merge keeps provider-sourced highlights, diff reports changes", () => {
    expect(mergeHighlights(["Fortune 500 Experience", "Stealth"], ["Serial Founder"], ["Stealth", "Serial Founder"])).toEqual(["Fortune 500 Experience", "Serial Founder"]);
    expect(diffHighlights(["a", "b"], ["b", "c"])).toEqual({ added: ["c"], removed: ["a"] });
  });
  it("percentiles are per group and tie-aware", () => {
    const xs = [{ g: "a", v: 1 }, { g: "a", v: 2 }, { g: "a", v: 2 }, { g: "a", v: 3 }, { g: "b", v: 9 }, { g: "b", v: null }];
    const r = percentileRanks(xs, (x) => x.g, (x) => x.v);
    expect(xs.map((x) => r.get(x))).toEqual([0, 1 / 3, 1 / 3, 1, 1, undefined]);
  });
});
