/**
 * Mailbox & calendar sources (plan 13.2): Gmail, Google Calendar, Outlook and Microsoft Calendar via
 * their REST APIs, **metadata only** (from / to / cc / attendees / date). Bodies, subjects and
 * attachments are never requested. Restricted Google scopes need verification + CASA (H10) and
 * Microsoft needs publisher verification, so the OAuth flows wait; the clients run on a stored token.
 */
import type { Transport } from "../crm/live";

export const NETWORK_PROVIDERS = ["LINKEDIN_CSV", "GMAIL", "OUTLOOK", "GCAL", "MSCAL"] as const;
export type NetworkProvider = (typeof NETWORK_PROVIDERS)[number];
export type MailProvider = Exclude<NetworkProvider, "LINKEDIN_CSV">;

export const MAIL_HOSTS: Record<MailProvider, string[]> = {
  GMAIL: ["gmail.googleapis.com"],
  GCAL: ["www.googleapis.com"],
  OUTLOOK: ["graph.microsoft.com"],
  MSCAL: ["graph.microsoft.com"],
};

export type Interaction = { email: string; name: string | null; at: string; channel: "EMAIL" | "MEETING" };
export type InteractionPage = { items: Interaction[]; next: string | null };

export interface MailSource {
  readonly provider: MailProvider;
  list(sinceIso: string, cursor: string | null): Promise<InteractionPage>;
}

/** "Ana Rojas" <ana@x.com>, b@y.com → [{ name, email }] */
export function parseAddresses(header: string | undefined | null): { name: string | null; email: string }[] {
  if (!header) return [];
  const out: { name: string | null; email: string }[] = [];
  for (const part of header.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)) {
    const m = /^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/.exec(part) ?? /^\s*()([^\s<>]+@[^\s<>]+)\s*$/.exec(part);
    if (!m) continue;
    const email = (m[2] as string).trim().toLowerCase();
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) out.push({ name: (m[1] ?? "").trim() || null, email });
  }
  return out;
}

/** Drop the user's own address, teammates (own domains), and automated senders. */
export function externalOnly(items: Interaction[], ownDomains: string[]): Interaction[] {
  const own = new Set(ownDomains.map((d) => d.toLowerCase()));
  return items.filter((i) => {
    const domain = i.email.split("@")[1] ?? "";
    if (own.has(domain)) return false;
    return !/^(no-?reply|notifications?|mailer-daemon|calendar-notification|bounce)/i.test(i.email);
  });
}

async function getJson(t: Transport, url: string, token: string): Promise<Record<string, unknown>> {
  const r = await t({ method: "GET", url, headers: { authorization: `Bearer ${token}`, accept: "application/json" } });
  if (r.status === 401 || r.status === 403) throw new Error("The mailbox token was rejected — reconnect the source");
  if (r.status >= 400) throw new Error(`Mailbox request failed (${r.status})`);
  return JSON.parse(r.body || "{}") as Record<string, unknown>;
}
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);

export function liveMailSource(provider: MailProvider, token: string, t: Transport): MailSource {
  switch (provider) {
    case "GMAIL":
      return {
        provider,
        async list(since, cursor) {
          const q = encodeURIComponent(`after:${Math.floor(new Date(since).getTime() / 1000)}`);
          const page = await getJson(t, `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100&q=${q}${cursor ? `&pageToken=${encodeURIComponent(cursor)}` : ""}`, token);
          const items: Interaction[] = [];
          for (const m of arr(page.messages)) {
            const msg = await getJson(t, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(String(m.id))}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Date`, token);
            const headers = arr((msg.payload as Record<string, unknown> | undefined)?.headers);
            const h = (n: string) => String(headers.find((x) => String(x.name).toLowerCase() === n)?.value ?? "");
            const at = new Date(Number(msg.internalDate) || h("date")).toISOString();
            for (const a of [...parseAddresses(h("from")), ...parseAddresses(h("to")), ...parseAddresses(h("cc"))]) items.push({ ...a, at, channel: "EMAIL" });
          }
          return { items, next: typeof page.nextPageToken === "string" ? page.nextPageToken : null };
        },
      };
    case "GCAL":
      return {
        provider,
        async list(since, cursor) {
          const page = await getJson(t, `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&maxResults=250&timeMin=${encodeURIComponent(since)}&fields=items(start,attendees(email,displayName)),nextPageToken${cursor ? `&pageToken=${encodeURIComponent(cursor)}` : ""}`, token);
          const items: Interaction[] = [];
          for (const ev of arr(page.items)) {
            const start = ev.start as Record<string, unknown> | undefined;
            const at = new Date(String(start?.dateTime ?? start?.date ?? since)).toISOString();
            for (const a of arr(ev.attendees)) if (a.email) items.push({ email: String(a.email).toLowerCase(), name: a.displayName ? String(a.displayName) : null, at, channel: "MEETING" });
          }
          return { items, next: typeof page.nextPageToken === "string" ? page.nextPageToken : null };
        },
      };
    case "OUTLOOK":
      return {
        provider,
        async list(since, cursor) {
          const url = cursor ?? `https://graph.microsoft.com/v1.0/me/messages?$top=100&$select=from,toRecipients,ccRecipients,sentDateTime&$filter=${encodeURIComponent(`sentDateTime ge ${since}`)}`;
          const page = await getJson(t, url, token);
          const items: Interaction[] = [];
          const addr = (r: Record<string, unknown>) => r.emailAddress as { address?: string; name?: string } | undefined;
          for (const m of arr(page.value)) {
            const at = new Date(String(m.sentDateTime)).toISOString();
            for (const r of [m.from as Record<string, unknown>, ...arr(m.toRecipients), ...arr(m.ccRecipients)]) {
              const a = r ? addr(r) : undefined;
              if (a?.address) items.push({ email: a.address.toLowerCase(), name: a.name ?? null, at, channel: "EMAIL" });
            }
          }
          const next = page["@odata.nextLink"];
          return { items, next: typeof next === "string" && next.startsWith("https://graph.microsoft.com/") ? next : null };
        },
      };
    case "MSCAL":
      return {
        provider,
        async list(since, cursor) {
          const url = cursor ?? `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${encodeURIComponent(since)}&endDateTime=${encodeURIComponent(new Date().toISOString())}&$top=100&$select=attendees,start`;
          const page = await getJson(t, url, token);
          const items: Interaction[] = [];
          for (const ev of arr(page.value)) {
            const at = new Date(String((ev.start as Record<string, unknown> | undefined)?.dateTime ?? since)).toISOString();
            for (const a of arr(ev.attendees)) {
              const e = a.emailAddress as { address?: string; name?: string } | undefined;
              if (e?.address) items.push({ email: e.address.toLowerCase(), name: e.name ?? null, at, channel: "MEETING" });
            }
          }
          const next = page["@odata.nextLink"];
          return { items, next: typeof next === "string" && next.startsWith("https://graph.microsoft.com/") ? next : null };
        },
      };
  }
}

/** Aggregate raw interactions into per-address evidence (count + latest) per channel. */
export function aggregate(items: Interaction[]): Map<string, { name: string | null; EMAIL?: { count: number; last: string }; MEETING?: { count: number; last: string } }> {
  const out = new Map<string, { name: string | null; EMAIL?: { count: number; last: string }; MEETING?: { count: number; last: string } }>();
  for (const i of items) {
    const cur = out.get(i.email) ?? { name: i.name };
    const ch = cur[i.channel] ?? { count: 0, last: i.at };
    ch.count++;
    if (i.at > ch.last) ch.last = i.at;
    cur[i.channel] = ch;
    cur.name = cur.name ?? i.name;
    out.set(i.email, cur);
  }
  return out;
}
