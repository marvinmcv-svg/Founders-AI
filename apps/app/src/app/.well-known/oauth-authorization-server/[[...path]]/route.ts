import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { auth } from "@/lib/auth";

/** RFC 8414 authorization-server metadata, at the root and path-inserted (`/api/auth`) locations. */
export const dynamic = "force-dynamic";
export const GET = oauthProviderAuthServerMetadata(auth, { headers: { "access-control-allow-origin": "*" } });
