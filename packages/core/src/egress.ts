/**
 * Egress proxy (plan 14 SSRF): the ONLY way server code may fetch a user-supplied URL
 * (Slack/webhook deliveries now; agent web_fetch, CSV-imported domains and the crawler later).
 *
 * - https only (http allowed only when EGRESS_ALLOW_HTTP=1, for local tests)
 * - default ports only (443 / 80)
 * - the hostname is resolved and EVERY address is checked against private, loopback,
 *   link-local, CGNAT, multicast, metadata and IPv6 ULA ranges; the connection is then pinned
 *   to the checked address (custom `lookup`), so DNS rebinding cannot swap it afterwards
 * - redirects are not followed (a delivery that redirects is treated as a failure)
 * - hard timeout and response-size cap
 *
 * A network-level forward proxy (e.g. Smokescreen) can sit in front of this once infra exists (H2).
 */
import { lookup as dnsLookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";

export class EgressBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EgressBlockedError";
  }
}

export type EgressOptions = {
  /** If set, the hostname must equal or be a subdomain of one of these. */
  allowHosts?: string[];
  timeoutMs?: number;
  maxBytes?: number;
  /** Test seam: replace DNS resolution. */
  resolve?: (host: string) => Promise<string[]>;
};

export type EgressResponse = { status: number; headers: Record<string, string>; body: string };

const V4_BLOCKS: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local incl. 169.254.169.254 metadata
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
];

function v4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

function inV4Block(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (v4ToInt(ip) & mask) === (v4ToInt(base) & mask);
}

/** True when an IP literal must never be contacted from the server. */
export function isBlockedAddress(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) return V4_BLOCKS.some(([b, bits]) => inV4Block(ip, b, bits));
  if (kind === 6) {
    const a = ip.toLowerCase();
    if (a === "::" || a === "::1") return true;
    const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped?.[1]) return isBlockedAddress(mapped[1]);
    if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(a)) return true; // hex-form mapped v4: refuse
    const first = parseInt(a.split(":")[0] || "0", 16);
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 ULA
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((first & 0xff00) === 0xff00) return true; // multicast
    if (a.startsWith("64:ff9b:")) return true; // NAT64 can reach v4 private space
    if (a.startsWith("2001:db8:")) return true; // documentation
    return false;
  }
  return true; // not an IP at all
}

function hostAllowed(host: string, allow?: string[]): boolean {
  if (!allow?.length) return true;
  return allow.some((h) => host === h || host.endsWith(`.${h}`));
}

/** Validate a URL without fetching it (used when a user saves a webhook). */
export function validateEgressUrl(raw: string, opts: Pick<EgressOptions, "allowHosts"> = {}): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new EgressBlockedError("Not a valid URL");
  }
  const allowHttp = process.env.EGRESS_ALLOW_HTTP === "1";
  if (u.protocol !== "https:" && !(allowHttp && u.protocol === "http:")) throw new EgressBlockedError("Only https URLs are allowed");
  if (u.username || u.password) throw new EgressBlockedError("Credentials in URLs are not allowed");
  if (u.port && !["443", "80"].includes(u.port)) throw new EgressBlockedError("Non-standard ports are not allowed");
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (net.isIP(host) && isBlockedAddress(host)) throw new EgressBlockedError("Private or reserved address");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local"))
    throw new EgressBlockedError("Internal hostnames are not allowed");
  if (!hostAllowed(host, opts.allowHosts)) throw new EgressBlockedError(`Host not allowed: ${host}`);
  return u;
}

async function defaultResolve(host: string): Promise<string[]> {
  if (net.isIP(host)) return [host];
  const res = await dnsLookup(host, { all: true, verbatim: true });
  return res.map((r) => r.address);
}

/** A `lookup` that always answers with the pre-validated address (handles `all: true` from autoSelectFamily). */
function pinnedLookup(address: string, family: number): net.LookupFunction {
  return (_host, options, callback) => {
    if (options.all) (callback as unknown as (e: null, a: { address: string; family: number }[]) => void)(null, [{ address, family }]);
    else callback(null, address, family);
  };
}

/** SSRF-safe request. Throws EgressBlockedError for policy violations. */
export async function egressFetch(
  rawUrl: string,
  init: { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; headers?: Record<string, string>; body?: string } = {},
  opts: EgressOptions = {},
): Promise<EgressResponse> {
  const u = validateEgressUrl(rawUrl, opts);
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const addrs = await (opts.resolve ?? defaultResolve)(host);
  if (!addrs.length) throw new EgressBlockedError("Host did not resolve");
  const bad = addrs.find(isBlockedAddress);
  if (bad) throw new EgressBlockedError(`Host resolves to a private or reserved address (${bad})`);
  const pinned = addrs[0] as string;
  const family = net.isIP(pinned);
  const timeoutMs = opts.timeoutMs ?? 8000;
  const maxBytes = opts.maxBytes ?? 512 * 1024;
  const mod = u.protocol === "https:" ? https : http;

  return new Promise<EgressResponse>((resolve, reject) => {
    const req = mod.request(
      {
        protocol: u.protocol,
        hostname: host,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: `${u.pathname}${u.search}`,
        method: init.method ?? "GET",
        headers: { "user-agent": "FoundersAI-Egress/1.0", ...(init.headers ?? {}) },
        servername: net.isIP(host) ? undefined : host,
        // Pin the socket to the address we validated (defeats DNS rebinding).
        lookup: pinnedLookup(pinned, family),
        timeout: timeoutMs,
      },
      (res) => {
        let size = 0;
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > maxBytes) {
            req.destroy(new EgressBlockedError("Response too large"));
            return;
          }
          chunks.push(c);
        });
        res.on("end", () => {
          const headers: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) if (typeof v === "string") headers[k] = v;
          resolve({ status: res.statusCode ?? 0, headers, body: Buffer.concat(chunks).toString("utf8") });
        });
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error(`Egress timeout after ${timeoutMs}ms`)));
    req.on("error", reject);
    if (init.body) req.write(init.body);
    req.end();
  });
}
