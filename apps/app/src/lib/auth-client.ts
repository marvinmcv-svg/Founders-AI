"use client";
import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";

/** `oauthProviderClient` forwards the signed OAuth query from /login and /oauth/consent (MCP sign-in, plan 12). */
export const authClient = createAuthClient({ plugins: [organizationClient(), oauthProviderClient()] });
