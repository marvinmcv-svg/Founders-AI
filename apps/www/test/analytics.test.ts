import { describe, expect, it } from "vitest";
import { buildEvent, EVENTS, track } from "@/lib/analytics";

describe("analytics", () => {
  it("sends nothing without explicit opt-in", () => {
    expect(buildEvent("cta_open_app", {}, null)).toBeNull();
    expect(buildEvent("cta_open_app", {}, "denied")).toBeNull();
    const layer: unknown[] = [];
    expect(track("cta_open_app", {}, { storage: { getItem: () => "denied" }, dataLayer: layer })).toBe(false);
    expect(layer).toHaveLength(0);
  });

  it("pushes known events after opt-in, with the path", () => {
    const layer: unknown[] = [];
    expect(track("api_sample_view", { sample: "revenue" }, { storage: { getItem: () => "granted" }, dataLayer: layer, path: "/api" })).toBe(true);
    expect(layer).toEqual([{ event: "api_sample_view", sample: "revenue", path: "/api" }]);
  });

  it("drops unknown events and anything that looks like an email", () => {
    expect(buildEvent("made_up", {}, "granted")).toBeNull();
    expect(buildEvent("newsletter_signup", { email: "a@b.co", label: "Subscribe", note: "x@y.z" }, "granted")).toEqual({ event: "newsletter_signup", label: "Subscribe", path: "" });
    expect(EVENTS).toContain("mcp_copy_url");
  });
});
