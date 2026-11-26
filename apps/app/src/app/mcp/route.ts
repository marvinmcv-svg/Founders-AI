import { requireMcpAuth } from "@better-auth/mcp";
import { principalFromApiKey, principalFromClaims, serveMcp } from "@founders/mcp";
import { auth, MCP_RESOURCE } from "@/lib/auth";

/**
 * MCP endpoint (plan 12): Streamable HTTP at /mcp. OAuth 2.1 bearer tokens (audience-bound to this
 * resource, verified against our JWKS) or an API key. Unauthenticated requests get 401 with the
 * RFC 9728 WWW-Authenticate challenge so clients start the OAuth flow.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const unauthorized = (msg: string) =>
  new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: msg }, id: null }), { status: 401, headers: { "content-type": "application/json" } });

const viaOAuth = requireMcpAuth(
  auth,
  async (req, claims) => {
    const p = await principalFromClaims(claims as Record<string, unknown>);
    if (!p) return unauthorized("This connection is not linked to a workspace you belong to. Reconnect the app.");
    return serveMcp(req, p);
  },
  { resource: MCP_RESOURCE },
);

async function handle(req: Request) {
  const key = await principalFromApiKey(req);
  if (key === null) return unauthorized("Invalid, pending or revoked API key.");
  if (key) return serveMcp(req, key);
  return viaOAuth(req);
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
