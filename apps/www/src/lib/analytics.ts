/**
 * Marketing analytics events (plan 15 Phase 9). Events go to window.dataLayer only after the visitor
 * opts in through the consent banner (Consent Mode v2 defaults to denied). No PII is ever sent.
 */
export const EVENTS = [
  "cta_open_app",
  "cta_book_demo",
  "cta_ecosystem",
  "newsletter_signup",
  "api_sample_view",
  "mcp_client_switch",
  "mcp_copy_url",
  "blog_post_click",
] as const;
export type EventName = (typeof EVENTS)[number];
export type EventProps = Record<string, string | number | boolean>;

type Env = { storage?: Pick<Storage, "getItem">; dataLayer?: unknown[]; path?: string };

const PII = /@|\bemail\b/i;

/** Pure core: returns the payload that would be sent, or null when consent is missing or the event is unknown. */
export function buildEvent(name: string, props: EventProps, consent: string | null, path = ""): ({ event: EventName; path: string } & EventProps) | null {
  if (consent !== "granted") return null;
  if (!(EVENTS as readonly string[]).includes(name)) return null;
  const clean: EventProps = {};
  for (const [k, v] of Object.entries(props)) if (!(typeof v === "string" && PII.test(v)) && !PII.test(k)) clean[k] = typeof v === "string" ? v.slice(0, 120) : v;
  return { ...clean, event: name as EventName, path };
}

export function track(name: EventName, props: EventProps = {}, env?: Env): boolean {
  const w = typeof window === "undefined" ? undefined : (window as unknown as { dataLayer?: unknown[] });
  const storage = env?.storage ?? (typeof localStorage === "undefined" ? undefined : localStorage);
  const payload = buildEvent(name, props, storage?.getItem("fai-consent") ?? null, env?.path ?? (typeof location === "undefined" ? "" : location.pathname));
  if (!payload) return false;
  const layer = env?.dataLayer ?? (w ? (w.dataLayer ??= []) : undefined);
  layer?.push(payload);
  return Boolean(layer);
}
