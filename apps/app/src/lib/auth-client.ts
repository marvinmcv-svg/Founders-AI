"use client";
import { createAuthClient } from "better-auth/react";
import { organizationClient, twoFactorClient } from "better-auth/client/plugins";
import { ssoClient } from "@better-auth/sso/client";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";

/** `oauthProviderClient` forwards the signed OAuth query from /login and /oauth/consent (MCP sign-in, plan 12). */
export const authClient = createAuthClient({
  plugins: [
    organizationClient(),
    oauthProviderClient(),
    ssoClient(),
    // Password sign-in of a user with 2FA on continues on /login/2fa.
    twoFactorClient({ onTwoFactorRedirect: () => window.location.assign(`/login/2fa${window.location.search}`) }),
  ],
});
