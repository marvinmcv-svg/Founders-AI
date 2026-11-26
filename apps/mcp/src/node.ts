/**
 * Standalone MCP server (Docker image for Railway/Fly — plan 0A). Same tools as the /mcp route in
 * the app; OAuth tokens are verified remotely against the app's JWKS (the app is the authorization
 * server), API keys against the database.
 *
 *   MCP_PORT=4100 MCP_RESOURCE_URL=https://mcp.example.com/mcp AUTH_ISSUER=https://app.example.com/api/auth pnpm --filter @founders/mcp start
 */
import "@founders/db/env";
import { serve } from "@hono/node-server";
import { createMcpProtectedRequestHandler } from "@better-auth/mcp";
import { principalFromApiKey, principalFromClaims } from "./principal";
import { serveMcp } from "./server";

const port = Number(process.env.MCP_PORT ?? 4100);
const resource = process.env.MCP_RESOURCE_URL ?? `http://localhost:${port}/mcp`;
const issuer = process.env.AUTH_ISSUER ?? "http://localhost:3001/api/auth";

const unauthorized = (msg: string) => new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: msg }, id: null }), { status: 401, headers: { "content-type": "application/json" } });

const viaOAuth = createMcpProtectedRequestHandler({ issuer, audience: resource, jwksUrl: `${issuer}/jwks`, jwtVerifyOptions: { requiredClaims: ["azp"] } }, async (req, claims) => {
  const p = await principalFromClaims(claims as Record<string, unknown>);
  return p ? serveMcp(req, p) : unauthorized("This connection is not linked to a workspace you belong to.");
});

serve({
  port,
  fetch: async (req: Request) => {
    const path = new URL(req.url).pathname;
    if (path === "/.well-known/oauth-protected-resource" || path === "/.well-known/oauth-protected-resource/mcp") {
      return Response.json({ resource, authorization_servers: [issuer], bearer_methods_supported: ["header"] });
    }
    if (path !== "/mcp") return new Response("Not found", { status: 404 });
    const key = await principalFromApiKey(req);
    if (key === null) return unauthorized("Invalid, pending or revoked API key.");
    return key ? serveMcp(req, key) : viaOAuth(req);
  },
});
console.log(`MCP server on http://localhost:${port}/mcp (issuer ${issuer})`);
