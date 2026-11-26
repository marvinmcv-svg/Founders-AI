import { describe, expect, it } from "vitest";
import { evaluateTalent } from "../src/jobs/talent";

describe("talent evaluation", () => {
  it("computes precision, recall and per-type counts", () => {
    const ev = evaluateTalent([
      { label: "NEW_COMPANY", detected: "NEW_COMPANY" },
      { label: "NONE", detected: "NEW_COMPANY" },
      { label: "NEW_ROLE", detected: null },
      { label: "NONE", detected: null },
      { label: null, detected: "PROMOTION" },
    ]);
    expect(ev.labelled).toBe(4);
    expect(ev.precision).toBe(0.5);
    expect(ev.recall).toBe(0.5);
    expect(ev.perType.NEW_COMPANY).toMatchObject({ tp: 1, fp: 1, fn: 0 });
    expect(ev.perType.NEW_ROLE).toMatchObject({ tp: 0, fn: 1, recall: 0 });
  });
});
