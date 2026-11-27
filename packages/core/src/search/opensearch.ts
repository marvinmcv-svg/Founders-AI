/**
 * Minimal OpenSearch 2.x HTTP client (plan 0A: standard REST API only, provider chosen by H2).
 * fetch-based; credentials from OPENSEARCH_URL userinfo or OPENSEARCH_USERNAME / OPENSEARCH_PASSWORD.
 */
export type OsFetch = (url: string, init: RequestInit) => Promise<Response>;

export class OpenSearchError extends Error {
  override name = "OpenSearchError";
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`OpenSearch HTTP ${status}: ${body.slice(0, 300)}`);
  }
}

export class OpenSearchClient {
  private readonly base: string;
  private readonly auth: string | null;

  constructor(
    url: string,
    private readonly fetchImpl: OsFetch = (u, i) => fetch(u, i),
    creds?: { username?: string; password?: string },
  ) {
    const u = new URL(url);
    const user = creds?.username ?? decodeURIComponent(u.username);
    const pass = creds?.password ?? decodeURIComponent(u.password);
    u.username = "";
    u.password = "";
    this.base = u.toString().replace(/\/+$/, "");
    this.auth = user ? `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}` : null;
  }

  static fromEnv(fetchImpl?: OsFetch): OpenSearchClient | null {
    const url = process.env.OPENSEARCH_URL?.trim();
    if (!url) return null;
    return new OpenSearchClient(url, fetchImpl, { username: process.env.OPENSEARCH_USERNAME, password: process.env.OPENSEARCH_PASSWORD });
  }

  async request<T = Record<string, unknown>>(method: string, path: string, body?: unknown, opts: { ndjson?: boolean; allow404?: boolean } = {}): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (this.auth) headers.Authorization = this.auth;
    if (body !== undefined) headers["Content-Type"] = opts.ndjson ? "application/x-ndjson" : "application/json";
    const res = await this.fetchImpl(`${this.base}${path}`, { method, headers, body: body === undefined ? undefined : opts.ndjson ? String(body) : JSON.stringify(body) });
    const text = await res.text();
    if (res.status === 404 && opts.allow404) return {} as T;
    if (!res.ok) throw new OpenSearchError(res.status, text);
    return (text ? JSON.parse(text) : {}) as T;
  }

  async indexExists(index: string): Promise<boolean> {
    const res = await this.fetchImpl(`${this.base}/${index}`, { method: "HEAD", headers: this.auth ? { Authorization: this.auth } : {} });
    return res.status === 200;
  }

  /** Bulk index/delete; throws when any item fails (with the first reason). */
  async bulk(ops: ({ index: { _index: string; _id: string }; doc: Record<string, unknown> } | { delete: { _index: string; _id: string } })[]): Promise<{ indexed: number; deleted: number }> {
    if (!ops.length) return { indexed: 0, deleted: 0 };
    const lines: string[] = [];
    let indexed = 0;
    let deleted = 0;
    for (const op of ops) {
      if ("index" in op) {
        lines.push(JSON.stringify({ index: op.index }), JSON.stringify(op.doc));
        indexed++;
      } else {
        lines.push(JSON.stringify({ delete: op.delete }));
        deleted++;
      }
    }
    const r = await this.request<{ errors?: boolean; items?: Record<string, { status: number; error?: { reason?: string } }>[] }>("POST", "/_bulk", `${lines.join("\n")}\n`, { ndjson: true });
    if (r.errors) {
      const bad = (r.items ?? []).map((it) => Object.values(it)[0]).find((x) => x && x.status >= 300 && !(x.status === 404 && !x.error));
      if (bad) throw new OpenSearchError(bad.status, bad.error?.reason ?? "bulk item failed");
    }
    return { indexed, deleted };
  }
}
