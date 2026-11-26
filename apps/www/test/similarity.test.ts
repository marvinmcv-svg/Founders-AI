import { describe, expect, it } from "vitest";
import { findOverlaps, N, shingles } from "../../../scripts/copy-similarity.mjs";

describe("copy similarity (plan 15 Phase 9)", () => {
  const reference = "Our platform helps the best investors in the world discover great companies before anyone else does today.";
  it("uses 8-word runs", () => {
    expect(N).toBe(8);
    expect(shingles("one two three four five six seven eight nine").size).toBe(2);
  });
  it("flags a string that copies 8 consecutive words, ignoring case and punctuation", () => {
    const hits = findOverlaps([{ where: "home.hero.sub", text: "We help THE BEST investors in the world, discover great companies." }], reference);
    expect(hits).toEqual([{ where: "home.hero.sub", run: "the best investors in the world discover great" }]);
  });
  it("allows 7 shared words", () => {
    expect(findOverlaps([{ where: "x", text: "the best investors in the world discover new teams" }], reference)).toEqual([]);
  });
});
