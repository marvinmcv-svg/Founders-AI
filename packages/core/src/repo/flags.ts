/**
 * Remote feature flags (`feature_flags`): platform-wide switches with an optional org allow-list.
 * Used for interest signals (H8), the extension's LinkedIn panel (H11) and interest telemetry
 * (never on without H8 + contracts). Values are cached for 30 s per process.
 */
import { sql } from "drizzle-orm";
import { PLATFORM_ORG, recordAudit } from "./audit";
import { rawQuery as q } from "./entities";

export const FLAGS = ["interest_signals", "extension_linkedin_panel", "interest_telemetry"] as const;
export type FlagKey = (typeof FLAGS)[number];

type FlagRow = { key: string; enabled: boolean; orgs: string[]; note: string | null; updated_by: string | null; updated_at: string };
let cache: { at: number; rows: Map<string, FlagRow> } | null = null;
const TTL_MS = 30_000;

async function load(): Promise<Map<string, FlagRow>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  const rows = await q<FlagRow>(sql`SELECT key, enabled, orgs, note, updated_by, updated_at FROM feature_flags`);
  cache = { at: Date.now(), rows: new Map(rows.map((r) => [r.key, r])) };
  return cache.rows;
}

/** On when enabled and (no allow-list, or the org is on it). Unknown flags and missing orgs are off. */
export async function isFlagOn(key: FlagKey, orgId?: string | null): Promise<boolean> {
  const f = (await load()).get(key);
  if (!f?.enabled) return false;
  if (!f.orgs.length) return true;
  return !!orgId && f.orgs.includes(orgId);
}

export async function listFlags() {
  return [...(await load()).values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** Platform-admin only (the caller checks PLATFORM_ADMIN_EMAILS). Audited. */
export async function setFlag(actor: string, key: FlagKey, input: { enabled: boolean; orgs?: string[] }) {
  if (!(FLAGS as readonly string[]).includes(key)) throw new Error("Unknown flag");
  if (key === "interest_telemetry" && input.enabled) throw new Error("Interest telemetry stays off until legal approval (H8) and customer contracts allow it");
  const orgs = (input.orgs ?? []).filter((o) => /^org_[A-Za-z0-9]+$/.test(o));
  await q(sql`INSERT INTO feature_flags (key, enabled, orgs, updated_by, updated_at) VALUES (${key}, ${input.enabled}, ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(orgs)}::jsonb)), ${actor}, now())
    ON CONFLICT (key) DO UPDATE SET enabled = EXCLUDED.enabled, orgs = EXCLUDED.orgs, updated_by = EXCLUDED.updated_by, updated_at = now()`);
  await recordAudit({ orgId: PLATFORM_ORG, actor, actorType: "platform_admin", action: `flag.${input.enabled ? "on" : "off"}`, target: key, metadata: { orgs } });
  cache = null;
}

export function clearFlagCache() {
  cache = null;
}
