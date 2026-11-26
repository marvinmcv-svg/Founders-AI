/**
 * Suppression keys (plan 14.5). The same normalisation runs in SQL (`founders_norm_linkedin`,
 * migration 0009) so the DB trigger and app code agree on what "the same person" means.
 */
import { createHash } from "node:crypto";

export type SuppressionKind = "email" | "linkedin" | "person_id";

export const sha256Hex = (v: string) => createHash("sha256").update(v, "utf8").digest("hex");

export function normEmail(email: string): string | null {
  const e = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

/** `linkedin.<com|invalid>/<in|company>/<slug>`, lower-cased; null if it is not a LinkedIn profile URL. */
export function normLinkedin(url: string): string | null {
  const m = url.toLowerCase().match(/linkedin\.(?:com|invalid)\/(?:in|company)\/[^/?#]+/);
  return m ? m[0] : null;
}

export function suppressionHash(kind: SuppressionKind, value: string): string | null {
  const v = kind === "email" ? normEmail(value) : kind === "linkedin" ? normLinkedin(value) : value.trim();
  return v ? sha256Hex(v) : null;
}
