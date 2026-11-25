/**
 * Saved-search email digest (plan 7.11). Builds the digest from "new since last read" results.
 * Delivery: Resend when RESEND_API_KEY is set (H3); otherwise the digest is stored in
 * `digest_runs` and viewable in the app (Settings → Notifications → Preview digest).
 */
import { brand } from "@founders/config";
import { sql } from "drizzle-orm";
import { PRODUCT_META } from "../filters/fields";
import { newId } from "../ids";
import { rawQuery as q } from "./entities";
import { getSavedSearches, getSavedSearchResults, refreshSavedSearch, type OrgContext } from "./workspace";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

function titleOf(row: Record<string, unknown>): string {
  return String(row.name ?? row.full_name ?? row.company_name ?? row.person_name ?? row.id);
}

export async function buildDigest(ctx: OrgContext, opts: { refresh?: boolean } = {}) {
  const searches = await getSavedSearches(ctx);
  const sections: { name: string; product: string; id: string; items: { id: string; title: string; subtitle: string }[]; newCount: number }[] = [];
  for (const s of searches) {
    if (s.alert_cadence === "OFF") continue;
    if (opts.refresh) await refreshSavedSearch(ctx, s.id);
    const res = await getSavedSearchResults(ctx, s.id, { newOnly: true, limit: 5 });
    if (!res.total) continue;
    sections.push({
      id: s.id,
      name: s.name,
      product: PRODUCT_META[s.product].label,
      newCount: res.total,
      items: res.rows.map((r) => ({
        id: String(r.id),
        title: titleOf(r),
        subtitle: String(r.tagline ?? r.headline ?? r.summary ?? r.type ?? ""),
      })),
    });
  }
  const total = sections.reduce((a, s) => a + s.newCount, 0);
  const appUrl = brand.urls.app;
  const html = `<!doctype html><html><body style="margin:0;background:#0a0a0a;font-family:Arial,sans-serif;color:#dedede">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px">
    <div style="font-size:12px;letter-spacing:.2em;color:#d8ff4a">${esc(brand.name.toUpperCase())}</div>
    <h1 style="color:#f5f5f5;font-size:22px;margin:12px 0 4px">${total} new result${total === 1 ? "" : "s"} across your saved searches</h1>
    <p style="color:#a3a3a3;font-size:14px;margin:0 0 24px">Here is what changed since you last looked.</p>
    ${sections
      .map(
        (s) => `<div style="border:1px solid #262626;border-radius:12px;padding:16px;margin-bottom:16px;background:#141414">
      <div style="font-size:12px;color:#a3a3a3">${esc(s.product)}</div>
      <div style="font-size:16px;color:#f5f5f5;font-weight:bold;margin:4px 0 12px">${esc(s.name)} <span style="color:#d8ff4a">+${s.newCount}</span></div>
      ${s.items.map((i) => `<div style="padding:6px 0;border-top:1px solid #262626"><div style="color:#f5f5f5;font-size:14px">${esc(i.title)}</div><div style="color:#a3a3a3;font-size:12px">${esc(i.subtitle)}</div></div>`).join("")}
      <a href="${esc(`${appUrl}/searches/${s.id}`)}" style="display:inline-block;margin-top:12px;color:#d8ff4a;font-size:13px">Open search →</a>
    </div>`,
      )
      .join("")}
  </div></body></html>`;
  return { total, sections, html };
}

export async function sendDigest(ctx: OrgContext, cadence: "DAILY" | "WEEKLY") {
  const d = await buildDigest(ctx, { refresh: true });
  await q(sql`INSERT INTO digest_runs (id, org_id, user_id, cadence, item_count, html) VALUES (${newId("event")}, ${ctx.orgId}, ${ctx.userId}, ${cadence}, ${d.total}, ${d.html})`);
  const key = process.env.RESEND_API_KEY;
  if (key && d.total > 0) {
    const [u] = await q<{ email: string }>(sql`SELECT email FROM "user" WHERE id = ${ctx.userId}`);
    if (u) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: `${brand.name} <digest@${brand.domain}>`, to: u.email, subject: `${d.total} new results in ${brand.name}`, html: d.html }),
      });
    }
  }
  return d;
}

export function getDigestRuns(ctx: OrgContext, limit = 10) {
  return q<{ id: string; cadence: string; item_count: number; sent_at: string; html: string }>(
    sql`SELECT id, cadence, item_count, sent_at, html FROM digest_runs WHERE org_id = ${ctx.orgId} AND user_id = ${ctx.userId} ORDER BY sent_at DESC LIMIT ${limit}`,
  );
}
