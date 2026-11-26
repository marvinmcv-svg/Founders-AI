import { describe, expect, it } from "vitest";
import { findMentions, pickNonOverlapping, type Resolved } from "../src/extract";

describe("entity mention finder", () => {
  it("finds identifiers and capitalised name spans with offsets", () => {
    const t = "Yesterday Acme Robotics (acme.io) hired Jane Doe, ex-CTO of Bank of Lima. Mail jane@acme.io or see https://www.linkedin.com/in/jane-doe/.";
    const m = findMentions(t);
    const keys = (k: string) => m.filter((x) => x.kind === k).map((x) => x.key);
    expect(keys("linkedin")).toEqual(["https://www.linkedin.com/in/jane-doe"]);
    expect(keys("email")).toEqual(["jane@acme.io"]);
    expect(keys("domain")).toEqual(["acme.io"]);
    const names = keys("name");
    expect(names).toEqual(expect.arrayContaining(["acme robotics", "jane doe", "bank of lima"]));
    expect(names).not.toContain("yesterday");
    for (const x of m) expect(t.slice(x.start, x.end).toLowerCase()).toBe(x.kind === "name" ? x.key : t.slice(x.start, x.end).toLowerCase());
  });

  it("ignores file names and lowercase text", () => {
    const m = findMentions("see report.pdf and image.png, nothing else here");
    expect(m).toEqual([]);
  });

  it("keeps identifiers over names and longer names over shorter ones", () => {
    const mk = (kind: "name" | "domain", start: number, end: number, id: string, c = 0.8): Resolved => ({ mention: { kind, text: "", key: "", start, end }, type: "company", id, name: id, confidence: c });
    const kept = pickNonOverlapping([mk("name", 0, 4, "short"), mk("name", 0, 13, "long"), mk("domain", 15, 22, "dom"), mk("name", 15, 19, "clash")]);
    expect(kept.map((k) => k.id)).toEqual(["long", "dom"]);
  });
});
