import { oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider";
import { auth } from "@/lib/auth";

/** OpenID Provider configuration (some MCP clients discover the authorization server this way). */
export const dynamic = "force-dynamic";
export const GET = oauthProviderOpenIdConfigMetadata(auth, { headers: { "access-control-allow-origin": "*" } });
