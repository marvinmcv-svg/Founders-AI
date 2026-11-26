# SSO, SCIM and 2FA

## Onboarding a customer's SSO
1. Workspace admin: Settings → Security → Add identity provider (OIDC discovery URL + client id/secret, or SAML entity ID + SSO URL + certificate). Redirect/ACS URLs are shown on the page.
2. They add the DNS TXT record `_founders-ai-<provider-id>.<domain>` and press Verify. If DNS is impossible, a platform admin can mark the domain verified from `/admin?tab=accounts` → the workspace → Single sign-on (only with proof of domain ownership; audited).
3. Optionally turn on **Require SSO** (needs the admin to be signed in through SSO).
4. SCIM: Settings → Security → New SCIM token; in the IdP use base URL `<app>/scim/v2`, Bearer token, provisioning of Users (no groups).

## Customer locked out
- "Require SSO" on and the IdP is broken: a platform admin turns the policy off:
  ```sql
  SET LOCAL ROLE founders_app; UPDATE organization SET require_sso = false WHERE id = '<org>'; RESET ROLE;
  ```
  This bypasses the app, so it is not in the workspace's audit log: record it in the incident notes, tell the workspace admin, and let them turn the policy back on in Settings once the IdP works (that change is audited).
- User lost their 2FA device and backup codes: verify identity out of band, then delete their `two_factor` row and set `user.two_factor_enabled = false`; they set it up again at next sign-in (Require 2FA sends them there).

## SCIM errors
- 401: token revoked or wrong; create a new one.
- 409 "seats": the workspace is out of seats; the customer adds seats in Settings → Billing.
- 501 on /Groups: expected (groups not supported); configure the IdP for user provisioning only.

## Known limits
- SCIM-provisioned users have no password; they sign in through SSO. There is no self-service password reset yet (it needs transactional e-mail, H3), so a workspace that uses SCIM should also use SSO.
- API keys and SCIM tokens are not subject to Require SSO / 2FA (they are separate credentials); revoke them when offboarding someone.
