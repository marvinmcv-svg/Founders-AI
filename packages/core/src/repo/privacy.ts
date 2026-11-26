/**
 * Privacy & compliance (plan 14.5): data-subject requests, the suppression list and self-service
 * account export/deletion.
 *
 * DSAR lifecycle: RECEIVED (public form; e-mail verification link sent) → VERIFIED (link clicked, or
 * an operator verified identity another way) → COMPLETED (ACCESS: export delivered; DELETE: person
 * erased; OPT_OUT: profile withdrawn from every product) | REJECTED. Due 30 days after receipt.
 *
 * Erasure and opt-out add the person's id, LinkedIn URL and e-mails to `suppression_list` (hashed);
 * DB triggers then drop any re-ingested row (migration 0009), so the person cannot come back
 * through a pipeline, a provider refresh or the seed.
 */
import { sql } from "drizzle-orm";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { sendEmail } from "../email";
import { newId } from "../ids";
import { DSAR_DUE_DAYS } from "../limits";
import { normEmail, normLinkedin, sha256Hex, suppressionHash, type SuppressionKind } from "../privacy";
import { assertPlatformAdmin, type AdminContext } from "./admin";
import { PLATFORM_ORG, recordAudit } from "./audit";
import { rawQuery as q } from "./entities";
import { ForbiddenError, NotFoundError, type OrgContext } from "./workspace";

export type DsarType = "ACCESS" | "DELETE" | "OPT_OUT";
export type DsarStatus = "RECEIVED" | "VERIFIED" | "COMPLETED" | "REJECTED";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

async function event(dsarId: string, actor: string, action: string, note?: string | null) {
  await q(sql`INSERT INTO dsar_events (id, dsar_id, actor, action, note) VALUES (${newId("dsarEvent")}, ${dsarId}, ${actor}, ${action}, ${note ?? null})`);
}

/* ------------------------------------------------------------------ */
/* Public: submit + verify                                             */
/* ------------------------------------------------------------------ */

export type DsarSubmission = { email: string; fullName?: string; type: DsarType; details?: string; linkedinUrl?: string };

/**
 * Public form. Returns the id; the verification token only goes out by e-mail. `verifyUrl` gets
 * `?id=…&token=…` appended (the marketing site's `/api/dsar/verify`).
 */
export async function submitDsar(input: DsarSubmission, verifyUrl?: string): Promise<{ id: string; emailed: boolean }> {
  const id = newId("dsar");
  const token = randomBytes(24).toString("base64url");
  const linkedin = input.linkedinUrl ? normLinkedin(input.linkedinUrl) : null;
  await q(sql`INSERT INTO dsar_requests (id, email, full_name, type, details, linkedin_url, due_at, verify_token_hash)
    VALUES (${id}, ${input.email.trim()}, ${input.fullName?.trim() ?? null}, ${input.type}, ${input.details?.trim() || null}, ${linkedin},
      now() + make_interval(days => ${DSAR_DUE_DAYS}), ${sha256Hex(token)})`);
  await event(id, "requester", "received", `type ${input.type}`);
  let emailed = false;
  if (verifyUrl) {
    const link = `${verifyUrl}${verifyUrl.includes("?") ? "&" : "?"}id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`;
    const r = await sendEmail({
      to: input.email.trim(),
      subject: "Confirm your privacy request",
      html: `<p>We received a ${esc(input.type === "ACCESS" ? "data access" : input.type === "DELETE" ? "deletion" : "do-not-sell/share")} request for this address.</p>
        <p><a href="${esc(link)}">Confirm it was you</a>. If you did not make this request, ignore this e-mail.</p>`,
    });
    emailed = r.sent;
    await event(id, "system", r.sent ? "verification_sent" : "verification_not_sent", r.sent ? null : r.reason);
  }
  return { id, emailed };
}

/** Back-compat for callers that only store the request. */
export async function insertDsar(input: DsarSubmission) {
  return (await submitDsar(input)).id;
}

export async function verifyDsar(id: string, token: string): Promise<boolean> {
  const [r] = await q<{ verify_token_hash: string | null; status: string }>(sql`SELECT verify_token_hash, status FROM dsar_requests WHERE id = ${id}`);
  if (!r?.verify_token_hash) return false;
  const a = Buffer.from(r.verify_token_hash);
  const b = Buffer.from(sha256Hex(token));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  if (r.status === "RECEIVED") {
    await q(sql`UPDATE dsar_requests SET status = 'VERIFIED', verified_at = now() WHERE id = ${id} AND status = 'RECEIVED'`);
    await event(id, "requester", "verified", "e-mail link");
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Admin queue                                                         */
/* ------------------------------------------------------------------ */

export type DsarRow = {
  id: string; email: string; full_name: string | null; type: DsarType; status: DsarStatus; details: string | null; linkedin_url: string | null;
  matched_person_ids: string[]; created_at: string; due_at: string; verified_at: string | null; completed_at: string | null; handled_by: string | null;
  result: Record<string, unknown> | null; days_left: number;
};

export function listDsars(a: AdminContext, status: "open" | DsarStatus = "open", limit = 100) {
  assertPlatformAdmin(a);
  const where = status === "open" ? sql`status IN ('RECEIVED', 'VERIFIED')` : sql`status = ${status}`;
  return q<DsarRow>(sql`SELECT id, email, full_name, type, status, details, linkedin_url, matched_person_ids, created_at, due_at, verified_at, completed_at, handled_by,
      result,
      floor(extract(epoch FROM (due_at - now())) / 86400)::int AS days_left
    FROM dsar_requests WHERE ${where} ORDER BY due_at ASC NULLS LAST LIMIT ${limit}`);
}

export async function dsarCounts(a: AdminContext) {
  assertPlatformAdmin(a);
  const [r] = await q<{ open: number; overdue: number; due_soon: number }>(sql`SELECT
      count(*) FILTER (WHERE status IN ('RECEIVED', 'VERIFIED'))::int AS open,
      count(*) FILTER (WHERE status IN ('RECEIVED', 'VERIFIED') AND due_at < now())::int AS overdue,
      count(*) FILTER (WHERE status IN ('RECEIVED', 'VERIFIED') AND due_at >= now() AND due_at < now() + interval '5 days')::int AS due_soon
    FROM dsar_requests`);
  return r ?? { open: 0, overdue: 0, due_soon: 0 };
}

export async function getDsar(a: AdminContext, id: string) {
  assertPlatformAdmin(a);
  const [d] = await q<DsarRow>(sql`SELECT *, floor(extract(epoch FROM (due_at - now())) / 86400)::int AS days_left FROM dsar_requests WHERE id = ${id}`);
  if (!d) throw new NotFoundError("Request not found");
  const events = await q<{ actor: string; action: string; note: string | null; at: string }>(sql`SELECT actor, action, note, at FROM dsar_events WHERE dsar_id = ${id} ORDER BY at`);
  return { ...d, events };
}

export type PersonMatch = { id: string; full_name: string; current_title: string | null; current_company_name: string | null; linkedin_url: string | null; why: string[] };

/** Candidate profiles for a request: exact e-mail, LinkedIn URL, then exact name. The operator confirms. */
export async function findDsarMatches(a: AdminContext, id: string): Promise<PersonMatch[]> {
  const d = await getDsar(a, id);
  const email = normEmail(d.email);
  const li = d.linkedin_url ? normLinkedin(d.linkedin_url) : null;
  const rows = await q<PersonMatch & { by_email: boolean; by_linkedin: boolean; by_name: boolean }>(sql`
    SELECT p.id, p.full_name, p.current_title, p.current_company_name, p.linkedin_url,
      EXISTS (SELECT 1 FROM person_emails e WHERE e.person_id = p.id AND lower(e.email) = ${email}) AS by_email,
      (${li}::text IS NOT NULL AND founders_norm_linkedin(p.linkedin_url) = ${li}) AS by_linkedin,
      (${d.full_name}::text IS NOT NULL AND lower(p.full_name) = lower(${d.full_name})) AS by_name
    FROM people p
    WHERE p.id IN (SELECT person_id FROM person_emails WHERE lower(email) = ${email})
       OR (${li}::text IS NOT NULL AND founders_norm_linkedin(p.linkedin_url) = ${li})
       OR (${d.full_name}::text IS NOT NULL AND lower(p.full_name) = lower(${d.full_name}))
    ORDER BY 6 DESC, 7 DESC LIMIT 20`);
  return rows.map(({ by_email, by_linkedin, by_name, ...p }) => ({ ...p, why: [by_email && "e-mail", by_linkedin && "LinkedIn", by_name && "name"].filter((x): x is string => Boolean(x)) }));
}

export async function setDsarMatches(a: AdminContext, id: string, personIds: string[]) {
  const d = await getDsar(a, id);
  if (d.status === "COMPLETED" || d.status === "REJECTED") throw new Error("Request is closed");
  const ids = [...new Set(personIds.filter((p) => /^per_[A-Za-z0-9]+$/.test(p)))].slice(0, 20);
  await q(sql`UPDATE dsar_requests SET matched_person_ids = ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb)), handled_by = ${a.email} WHERE id = ${id}`);
  await event(id, a.email, "matched", ids.join(", ") || "no profile");
}

/** Identity confirmed another way (reply from the address, signed letter …). */
export async function markDsarVerified(a: AdminContext, id: string, note: string) {
  const d = await getDsar(a, id);
  if (d.status !== "RECEIVED") throw new Error("Only received requests can be verified");
  if (!note.trim()) throw new Error("Say how identity was verified");
  await q(sql`UPDATE dsar_requests SET status = 'VERIFIED', verified_at = now(), handled_by = ${a.email} WHERE id = ${id}`);
  await event(id, a.email, "verified", note.trim().slice(0, 500));
  await recordAudit({ orgId: PLATFORM_ORG, actor: a.email, actorType: "platform_admin", action: "dsar.verify", target: id });
}

export async function rejectDsar(a: AdminContext, id: string, reason: string) {
  const d = await getDsar(a, id);
  if (d.status === "COMPLETED" || d.status === "REJECTED") throw new Error("Request is closed");
  if (!reason.trim()) throw new Error("A reason is required");
  await q(sql`UPDATE dsar_requests SET status = 'REJECTED', completed_at = now(), handled_by = ${a.email}, result = ${JSON.stringify({ reason: reason.trim() })}::jsonb WHERE id = ${id}`);
  await event(id, a.email, "rejected", reason.trim().slice(0, 500));
  await recordAudit({ orgId: PLATFORM_ORG, actor: a.email, actorType: "platform_admin", action: "dsar.reject", target: id });
}

/* ------------------------------------------------------------------ */
/* Person export / erasure / opt-out                                   */
/* ------------------------------------------------------------------ */

/** Everything we hold about a person (GDPR Art. 15): profile, contact data, history, signals, sources. */
export async function personExport(personId: string) {
  const [profile] = await q(sql`SELECT id, full_name, first, last, headline, bio, location, country, linkedin_url, x_url, github_url, avatar_url,
      current_title, current_company_name, department, seniority, years_experience, highlights, education_summary, followers, connections, provenance, created_at
    FROM people WHERE id = ${personId}`);
  if (!profile) return null;
  const [emails, experience, education, signals, changes, workspaces] = await Promise.all([
    q(sql`SELECT email, type, status, source, checked_at FROM person_emails WHERE person_id = ${personId}`),
    q(sql`SELECT company_name, title, department, start, "end", is_current, is_founder FROM person_experience WHERE person_id = ${personId} ORDER BY start DESC NULLS LAST`),
    q(sql`SELECT s.name AS school, e.degree, e.field, e.start, e."end" FROM person_education e LEFT JOIN schools s ON s.id = e.school_id WHERE e.person_id = ${personId}`),
    q(sql`SELECT type, score, summary, signal_date, sources FROM talent_signals WHERE person_id = ${personId} ORDER BY signal_date DESC`),
    q(sql`SELECT source, observed_at, label FROM person_changes WHERE person_id = ${personId} ORDER BY observed_at DESC LIMIT 200`),
    q<{ n: number }>(sql`SELECT count(DISTINCT org_id)::int AS n FROM (
        SELECT l.org_id FROM list_items li JOIN lists l ON l.id = li.list_id WHERE li.entity_id = ${personId}
        UNION SELECT org_id FROM notes WHERE entity_id = ${personId} UNION SELECT org_id FROM network_edges WHERE person_id = ${personId}) x`),
  ]);
  return {
    profile,
    emails,
    experience,
    education,
    talent_signals: signals,
    observed_changes: changes,
    recipients: { customer_workspaces_that_saved_or_connected_this_profile: workspaces[0]?.n ?? 0 },
    sources_note: "Per-field sources are listed under profile.provenance.",
  };
}

const PERSON_TABLES = ["person_emails", "person_experience", "person_education", "company_people", "talent_signals", "person_changes", "network_edges"] as const;
const ENTITY_TABLES = ["list_items", "notes", "likes", "hides", "entity_status", "crm_records", "highlight_events", "search_result_snapshots"] as const;

async function suppress(kind: SuppressionKind, value: string | null | undefined, reason: string, dsarId: string | null, by: string) {
  if (!value) return false;
  const h = suppressionHash(kind, value);
  if (!h) return false;
  const r = await q(sql`INSERT INTO suppression_list (id, kind, value_hash, reason, dsar_id, created_by) VALUES (${newId("suppression")}, ${kind}, ${h}, ${reason}, ${dsarId}, ${by})
    ON CONFLICT (kind, value_hash) DO NOTHING RETURNING id`);
  return r.length > 0;
}

async function suppressPersonKeys(personId: string, extraEmails: string[], reason: string, dsarId: string | null, by: string) {
  const [p] = await q<{ linkedin_url: string | null }>(sql`SELECT linkedin_url FROM people WHERE id = ${personId}`);
  const emails = (await q<{ email: string }>(sql`SELECT email FROM person_emails WHERE person_id = ${personId}`)).map((e) => e.email);
  let n = 0;
  if (await suppress("person_id", personId, reason, dsarId, by)) n++;
  if (await suppress("linkedin", p?.linkedin_url, reason, dsarId, by)) n++;
  for (const e of new Set([...emails, ...extraEmails])) if (await suppress("email", e, reason, dsarId, by)) n++;
  return n;
}

/** Hard delete of the person and every row keyed to them (ours and customers'). */
export async function erasePerson(personId: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const t of PERSON_TABLES) counts[t] = (await q(sql`DELETE FROM ${sql.raw(t)} WHERE person_id = ${personId} RETURNING 1`)).length;
  for (const t of ENTITY_TABLES) counts[t] = (await q(sql`DELETE FROM ${sql.raw(t)} WHERE entity_id = ${personId} RETURNING 1`)).length;
  counts.interest_signals = (await q(sql`DELETE FROM interest_signals WHERE target_person_id = ${personId} RETURNING 1`)).length;
  await q(sql`UPDATE investors SET person_id = NULL WHERE person_id = ${personId}`);
  counts.people = (await q(sql`DELETE FROM people WHERE id = ${personId} RETURNING 1`)).length;
  // Downstream consumers (search index, bulk incrementals) see the removal; alerts skip it.
  await q(sql`INSERT INTO outbox_events (product, entity_id, kind, alerts_processed_at) VALUES ('people', ${personId}, 'DELETED', now())`);
  return counts;
}

/** CCPA "do not sell/share": withdraw the profile from every product and drop contact data. */
export async function withdrawPerson(personId: string): Promise<Record<string, number>> {
  const emails = (await q(sql`DELETE FROM person_emails WHERE person_id = ${personId} RETURNING 1`)).length;
  const hidden = (await q(sql`UPDATE people SET deleted_at = now() WHERE id = ${personId} AND deleted_at IS NULL RETURNING 1`)).length;
  await q(sql`INSERT INTO outbox_events (product, entity_id, kind, alerts_processed_at) VALUES ('people', ${personId}, 'DELETED', now())`);
  return { person_emails: emails, people_hidden: hidden };
}

/**
 * Close a verified request. ACCESS: build the export (stored on the request, e-mailed when Resend
 * is set). DELETE: suppress, then erase. OPT_OUT: suppress, then withdraw. With no matched profile
 * the requester's e-mail is still suppressed for DELETE/OPT_OUT, so future ingestion skips it.
 */
export async function completeDsar(a: AdminContext, id: string) {
  const d = await getDsar(a, id);
  if (d.status !== "VERIFIED") throw new Error(d.status === "RECEIVED" ? "Verify the requester's identity first" : "Request is closed");
  let result: Record<string, unknown>;
  if (d.type === "ACCESS") {
    const exports = (await Promise.all(d.matched_person_ids.map(personExport))).filter(Boolean);
    result = { generated_at: new Date().toISOString(), profiles: exports, note: exports.length ? undefined : "We hold no profile matching this request." };
    const r = await sendEmail({
      to: d.email,
      subject: "Your data access request",
      html: `<p>Here is the data we hold about you${exports.length ? "" : " (none found)"}.</p><pre style="font-size:12px;white-space:pre-wrap">${esc(JSON.stringify(result, null, 2))}</pre>`,
    });
    await event(id, "system", r.sent ? "export_sent" : "export_not_sent", r.sent ? null : `${r.reason}; download it from the admin console and send it by hand`);
  } else {
    const reason = d.type === "DELETE" ? "DELETE" : "OPT_OUT";
    let suppressed = 0;
    const removed: Record<string, Record<string, number>> = {};
    for (const pid of d.matched_person_ids) {
      suppressed += await suppressPersonKeys(pid, [d.email], reason, id, a.email);
      removed[pid] = d.type === "DELETE" ? await erasePerson(pid) : await withdrawPerson(pid);
    }
    if (await suppress("email", d.email, reason, id, a.email)) suppressed++;
    if (await suppress("linkedin", d.linkedin_url, reason, id, a.email)) suppressed++;
    result = { suppression_entries_added: suppressed, removed };
    await sendEmail({ to: d.email, subject: "Your privacy request is complete", html: `<p>We have ${d.type === "DELETE" ? "deleted your profile and" : "withdrawn your profile from our products and"} added you to our suppression list, so your data will not be collected again.</p>` });
  }
  await q(sql`UPDATE dsar_requests SET status = 'COMPLETED', completed_at = now(), handled_by = ${a.email}, result = ${JSON.stringify(result)}::jsonb WHERE id = ${id}`);
  await event(id, a.email, "completed", d.type);
  await recordAudit({ orgId: PLATFORM_ORG, actor: a.email, actorType: "platform_admin", action: `dsar.complete.${d.type.toLowerCase()}`, target: id, metadata: { profiles: d.matched_person_ids.length } });
  return result;
}

/* ------------------------------------------------------------------ */
/* Suppression list (admin)                                            */
/* ------------------------------------------------------------------ */

export async function addSuppression(a: AdminContext, kind: SuppressionKind, value: string, note?: string) {
  assertPlatformAdmin(a);
  if (!suppressionHash(kind, value)) throw new Error(`Not a valid ${kind}`);
  const added = await suppress(kind, value, "ADMIN", null, a.email);
  // Also withdraw anything already in the DB that matches.
  let withdrawn = 0;
  const h = suppressionHash(kind, value)!;
  const ids =
    kind === "person_id"
      ? [value.trim()]
      : kind === "linkedin"
        ? (await q<{ id: string }>(sql`SELECT id FROM people WHERE founders_sha256(founders_norm_linkedin(linkedin_url)) = ${h}`)).map((r) => r.id)
        : (await q<{ person_id: string }>(sql`SELECT person_id FROM person_emails WHERE founders_sha256(lower(trim(email))) = ${h}`)).map((r) => r.person_id);
  for (const pid of ids) {
    await suppressPersonKeys(pid, [], "ADMIN", null, a.email);
    withdrawn += (await withdrawPerson(pid)).people_hidden ?? 0;
  }
  await recordAudit({ orgId: PLATFORM_ORG, actor: a.email, actorType: "platform_admin", action: "suppression.add", target: kind, metadata: { note: note?.slice(0, 200), withdrawn } });
  return { added, withdrawn };
}

export async function suppressionStats(a: AdminContext) {
  assertPlatformAdmin(a);
  return q<{ kind: string; reason: string; n: number }>(sql`SELECT kind, reason, count(*)::int AS n FROM suppression_list GROUP BY 1, 2 ORDER BY 1, 2`);
}

export async function isSuppressed(input: { personId?: string | null; linkedinUrl?: string | null; email?: string | null }) {
  const hashes: { kind: SuppressionKind; h: string }[] = [];
  if (input.personId) hashes.push({ kind: "person_id", h: suppressionHash("person_id", input.personId)! });
  const li = input.linkedinUrl ? suppressionHash("linkedin", input.linkedinUrl) : null;
  if (li) hashes.push({ kind: "linkedin", h: li });
  const em = input.email ? suppressionHash("email", input.email) : null;
  if (em) hashes.push({ kind: "email", h: em });
  if (!hashes.length) return false;
  const r = await q(sql`SELECT 1 FROM suppression_list WHERE ${sql.join(hashes.map((x) => sql`(kind = ${x.kind} AND value_hash = ${x.h})`), sql` OR `)} LIMIT 1`);
  return r.length > 0;
}

/* ------------------------------------------------------------------ */
/* Self-service (Settings → Data & privacy)                            */
/* ------------------------------------------------------------------ */

/** A user's own account data across all their workspaces (portable JSON). */
export async function exportMyData(ctx: OrgContext) {
  const [user] = await q(sql`SELECT id, name, email, timezone, two_factor_enabled, created_at FROM "user" WHERE id = ${ctx.userId}`);
  const [memberships, lists, searches, notes, keys, threads, sessions, network] = await Promise.all([
    q(sql`SELECT o.name AS workspace, m.role, m.created_at AS joined_at, m.agent_instructions FROM member m JOIN organization o ON o.id = m.organization_id WHERE m.user_id = ${ctx.userId}`),
    q(sql`SELECT l.id, l.name, l.entity_type, l.visibility, l.created_at, (SELECT array_agg(entity_id) FROM list_items li WHERE li.list_id = l.id) AS items
      FROM lists l WHERE l.owner_id = ${ctx.userId} AND l.deleted_at IS NULL`),
    q(sql`SELECT id, name, product, filter_ast, nl_query, alert_cadence, created_at FROM saved_searches WHERE owner_id = ${ctx.userId} AND deleted_at IS NULL`),
    q(sql`SELECT entity_type, entity_id, body, created_at FROM notes WHERE author_id = ${ctx.userId} AND deleted_at IS NULL`),
    q(sql`SELECT name, prefix, scopes, status, created_at, last_used_at FROM api_keys WHERE user_id = ${ctx.userId}`),
    q(sql`SELECT id, title, visibility, created_at FROM agent_threads WHERE owner_id = ${ctx.userId} AND deleted_at IS NULL`),
    q(sql`SELECT created_at, expires_at, ip_address, user_agent FROM session WHERE user_id = ${ctx.userId}`),
    q(sql`SELECT provider, status, created_at FROM network_sources WHERE user_id = ${ctx.userId}`),
  ]);
  await recordAudit({ orgId: ctx.orgId, actor: ctx.userId, action: "privacy.export_my_data" });
  return { generated_at: new Date().toISOString(), user, memberships, lists, saved_searches: searches, notes, api_keys: keys, agent_threads: threads, sessions, network_sources: network };
}

export class AccountDeletionBlockedError extends Error {
  constructor(workspaces: string[]) {
    super(`You are the only owner/admin of ${workspaces.join(", ")}, which still has other members. Make someone else an admin first.`);
    this.name = "AccountDeletionBlockedError";
  }
}

/**
 * Delete the signed-in user's account: private lists, saved searches, network sources and keys
 * go; shared workspace content (team lists, notes) stays with the workspace, unattributed.
 */
export async function deleteMyAccount(ctx: OrgContext, confirmEmail: string) {
  const [u] = await q<{ email: string }>(sql`SELECT email FROM "user" WHERE id = ${ctx.userId}`);
  if (!u) throw new NotFoundError("Account not found");
  if (u.email.toLowerCase() !== confirmEmail.trim().toLowerCase()) throw new ForbiddenError("Type your account e-mail to confirm");
  const blocking = await q<{ name: string }>(sql`SELECT o.name FROM member m JOIN organization o ON o.id = m.organization_id
    WHERE m.user_id = ${ctx.userId} AND m.role IN ('owner', 'admin')
      AND NOT EXISTS (SELECT 1 FROM member m2 WHERE m2.organization_id = m.organization_id AND m2.user_id <> m.user_id AND m2.role IN ('owner', 'admin'))
      AND EXISTS (SELECT 1 FROM member m3 WHERE m3.organization_id = m.organization_id AND m3.user_id <> m.user_id)`);
  if (blocking.length) throw new AccountDeletionBlockedError(blocking.map((b) => b.name));
  const orgs = (await q<{ organization_id: string }>(sql`SELECT organization_id FROM member WHERE user_id = ${ctx.userId}`)).map((r) => r.organization_id);
  await q(sql`UPDATE api_keys SET status = 'REVOKED' WHERE user_id = ${ctx.userId}`);
  await q(sql`DELETE FROM list_items WHERE list_id IN (SELECT id FROM lists WHERE owner_id = ${ctx.userId} AND visibility <> 'TEAM')`);
  await q(sql`DELETE FROM lists WHERE owner_id = ${ctx.userId} AND visibility <> 'TEAM'`);
  await q(sql`DELETE FROM saved_searches WHERE owner_id = ${ctx.userId} AND visibility <> 'TEAM'`);
  await q(sql`DELETE FROM network_edges WHERE user_id = ${ctx.userId}`);
  await q(sql`DELETE FROM network_sources WHERE user_id = ${ctx.userId}`);
  await q(sql`DELETE FROM notifications WHERE user_id = ${ctx.userId}`);
  await q(sql`DELETE FROM scim_users WHERE user_id = ${ctx.userId}`);
  for (const org of orgs) await recordAudit({ orgId: org, actor: ctx.userId, action: "account.delete", target: ctx.userId });
  // FK cascades remove sessions, accounts, memberships and 2FA.
  await q(sql`DELETE FROM "user" WHERE id = ${ctx.userId}`);
  return { workspaces: orgs.length };
}
