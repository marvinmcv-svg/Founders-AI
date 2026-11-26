import { auth } from "@/lib/auth";

/**
 * RFC 9728 protected-resource metadata for the MCP endpoint (`/.well-known/oauth-protected-resource`
 * and the path-inserted `/.well-known/oauth-protected-resource/mcp`). The `mcp()` plugin builds the
 * document; this route only forwards root-level requests to the auth handler.
 */
export const dynamic = "force-dynamic";
export const GET = (req: Request) => auth.handler(req);
export const HEAD = GET;
