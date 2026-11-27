/**
 * Status page + health (plan 15 Phase 10). Component health is computed live from the database;
 * incidents are posted by platform admins. Nothing here is customer data, so it is public.
 */
import { searchBackendEnabled, searchIndexLagSeconds } from "../search";
import { sql } from "drizzle-orm";
import { newId } from "../ids";
import { assertPlatformAdmin, type AdminContext } from "./admin";
import { PLATFORM_ORG, recordAudit } from "./audit";
import { rawQuery as q } from "./entities";
import { NotFoundError } from "./workspace";

export type ComponentState = "operational" | "degraded" | "outage";
export type Component = { id: string; name: string; state: ComponentState; detail: string };
export type Incident = { id: string; title: string; status: string; impact: "minor" | "major" | "critical"; components: string[]; updates: { at: string; status: string; body: string }[]; created_at: string; resolved_at: string | null };

export const STATUS_COMPONENTS = [
  { id: "app", name: "Web app" },
  { id: "api", name: "REST API" },
  { id: "mcp", name: "MCP server" },
  { id: "data", name: "Data pipelines" },
  { id: "webhooks", name: "Webhooks & alerts" },
  { id: "billing", name: "Billing" },
] as const;

const rank: Record<ComponentState, number> = { operational: 0, degraded: 1, outage: 2 };
const worst = (a: ComponentState, b: ComponentState) => (rank[a] >= rank[b] ? a : b);

async function checks(): Promise<Record<string, { state: ComponentState; detail: string }>> {
  const t0 = performance.now();
  let db: { state: ComponentState; detail: string };
  try {
    await q(sql`SELECT 1`);
    const ms = performance.now() - t0;
    db = { state: ms > 1500 ? "degraded" : "operational", detail: `database ${Math.round(ms)} ms` };
  } catch {
    const down = { state: "outage" as const, detail: "database unreachable" };
    return Object.fromEntries(STATUS_COMPONENTS.map((c) => [c.id, down]));
  }
  const [runs] = await q<{ failed: number; last: string | null }>(sql`SELECT count(*) FILTER (WHERE status = 'FAILED' AND started_at > now() - interval '26 hours')::int AS failed,
      max(finished_at) FILTER (WHERE status = 'SUCCEEDED') AS last FROM pipeline_runs WHERE started_at > now() - interval '7 days'`);
  const lastOk = runs?.last ? new Date(runs.last) : null;
  const staleH = lastOk ? (Date.now() - lastOk.getTime()) / 3_600_000 : Infinity;
  const data: { state: ComponentState; detail: string } =
    (runs?.failed ?? 0) > 0 ? { state: "degraded", detail: `${runs!.failed} job(s) failed in the last 26 h` } : staleH > 36 ? { state: "degraded", detail: lastOk ? `last successful run ${Math.round(staleH)} h ago` : "no recent runs" } : { state: "operational", detail: `last run ${Math.round(staleH)} h ago` };
  // Search index freshness (D-075): only when grids are served from OpenSearch.
  let dataState = data;
  if (searchBackendEnabled()) {
    const lag = await searchIndexLagSeconds().catch(() => 0);
    if (lag > 600 && dataState.state === "operational") dataState = { state: "degraded", detail: `search index ${Math.round(lag / 60)} min behind` };
  }
  const [wh] = await q<{ backlog: number }>(sql`SELECT count(*)::int AS backlog FROM webhook_deliveries WHERE status = 'PENDING' AND created_at < now() - interval '1 hour'`).catch(() => [{ backlog: 0 }]);
  const webhooks: { state: ComponentState; detail: string } = (wh?.backlog ?? 0) > 500 ? { state: "degraded", detail: `${wh!.backlog} deliveries waiting > 1 h` } : { state: "operational", detail: `${wh?.backlog ?? 0} deliveries waiting > 1 h` };
  const [st] = await q<{ errors: number }>(sql`SELECT count(*)::int AS errors FROM stripe_events WHERE error IS NOT NULL AND processed_at IS NULL AND received_at > now() - interval '24 hours'`);
  const billing: { state: ComponentState; detail: string } = (st?.errors ?? 0) > 0 ? { state: "degraded", detail: `${st!.errors} payment event(s) failed to apply` } : { state: "operational", detail: "events applied" };
  return { app: db, api: db, mcp: db, data: dataState, webhooks, billing };
}

export function activeIncidents() {
  return q<Incident>(sql`SELECT * FROM status_incidents WHERE resolved_at IS NULL ORDER BY created_at DESC`);
}

export function recentIncidents(days = 14) {
  return q<Incident>(sql`SELECT * FROM status_incidents WHERE created_at > now() - make_interval(days => ${days}) ORDER BY created_at DESC LIMIT 50`);
}

/** Live component states, raised by any open incident on that component. */
export async function systemStatus() {
  const [c, open] = await Promise.all([checks(), activeIncidents().catch(() => [] as Incident[])]);
  const components: Component[] = STATUS_COMPONENTS.map((x) => {
    let state = c[x.id]?.state ?? "operational";
    for (const i of open) if (i.components.includes(x.id)) state = worst(state, i.impact === "minor" ? "degraded" : i.impact === "major" ? "degraded" : "outage");
    return { id: x.id, name: x.name, state, detail: c[x.id]?.detail ?? "" };
  });
  const overall = components.reduce<ComponentState>((s, x) => worst(s, x.state), "operational");
  return { overall, components, checkedAt: new Date().toISOString() };
}

const STATUSES = ["investigating", "identified", "monitoring", "resolved"] as const;

export async function createIncident(a: AdminContext, input: { title: string; impact: string; components: string[]; body: string }) {
  assertPlatformAdmin(a);
  const title = input.title.trim();
  if (title.length < 4) throw new Error("Give the incident a title");
  const impact = (["minor", "major", "critical"] as const).find((x) => x === input.impact) ?? "minor";
  const components = input.components.filter((c) => STATUS_COMPONENTS.some((x) => x.id === c));
  if (!components.length) throw new Error("Pick at least one affected component");
  const id = newId("event");
  const updates = [{ at: new Date().toISOString(), status: "investigating", body: input.body.trim() || "We are investigating." }];
  await q(sql`INSERT INTO status_incidents (id, title, status, impact, components, updates, created_by)
    VALUES (${id}, ${title.slice(0, 160)}, 'investigating', ${impact}, ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(components)}::jsonb)), ${JSON.stringify(updates)}::jsonb, ${a.email})`);
  await recordAudit({ orgId: PLATFORM_ORG, actor: a.email, actorType: "platform_admin", action: "status.incident.create", target: id, metadata: { impact, components } });
  return id;
}

export async function updateIncident(a: AdminContext, id: string, status: string, body: string) {
  assertPlatformAdmin(a);
  const s = STATUSES.find((x) => x === status);
  if (!s) throw new Error("Unknown status");
  if (!body.trim()) throw new Error("Write an update");
  const upd = { at: new Date().toISOString(), status: s, body: body.trim().slice(0, 2000) };
  const r = await q(sql`UPDATE status_incidents SET status = ${s}, updates = updates || ${JSON.stringify([upd])}::jsonb,
      resolved_at = CASE WHEN ${s} = 'resolved' THEN now() ELSE NULL END WHERE id = ${id} RETURNING id`);
  if (!r.length) throw new NotFoundError("Incident not found");
  await recordAudit({ orgId: PLATFORM_ORG, actor: a.email, actorType: "platform_admin", action: `status.incident.${s}`, target: id });
}
