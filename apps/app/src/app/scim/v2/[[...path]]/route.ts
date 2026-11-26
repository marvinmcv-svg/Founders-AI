import * as repo from "@founders/core/repo";

/**
 * SCIM 2.0 service provider (plan 14.4): `<app>/scim/v2` with a workspace SCIM token as Bearer.
 * Users only; see packages/core/src/repo/scim.ts for the mapping.
 */
export const runtime = "nodejs";

async function handle(req: Request, { params }: { params: Promise<unknown> }) {
  const { path = [] } = (await params) as { path?: string[] };
  const url = new URL(req.url);
  let body: unknown;
  if (req.method !== "GET" && req.method !== "DELETE") {
    const text = await req.text();
    if (text.length > 256 * 1024) return Response.json({ detail: "Payload too large" }, { status: 413 });
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      return Response.json({ schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], status: "400", scimType: "invalidSyntax", detail: "Body is not JSON" }, { status: 400 });
    }
  }
  const r = await repo.handleScim({
    method: req.method,
    path: `/${path.join("/")}`,
    query: url.searchParams,
    body,
    authorization: req.headers.get("authorization"),
    baseUrl: `${url.origin}/scim/v2`,
  });
  if (r.status === 204) return new Response(null, { status: 204 });
  return new Response(JSON.stringify(r.body), { status: r.status, headers: { "Content-Type": "application/scim+json; charset=utf-8", "Cache-Control": "no-store", ...r.headers } });
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
