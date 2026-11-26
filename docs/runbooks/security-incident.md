# Security incident: leaked secret, suspicious access

1. **SEV1.** Start incident response; involve the security owner.
2. **Contain**:
   - Customer API key leaked: revoke it (Settings → API keys, or `/admin` → Accounts → keys); keys are hashed, so a new one must be issued.
   - SCIM token leaked: revoke in Settings → Security; create a new one in the IdP.
   - Our secrets (`BETTER_AUTH_SECRET`, `INTEGRATIONS_ENCRYPTION_KEY`, `STRIPE_*`, `CRON_SECRET`, DB password): rotate in the provider, update Vercel env, redeploy. Rotating `BETTER_AUTH_SECRET` signs everyone out; rotating `INTEGRATIONS_ENCRYPTION_KEY` requires re-entering CRM/bulk credentials (they are encrypted with it).
3. **Investigate**: workspace audit logs (Settings → Audit log; CSV), `usage_events` by key, Vercel logs by IP. Check `verifyAuditChain` status on the audit page — a broken chain means someone edited history.
4. **Notify**: affected customers (and authorities when personal data is involved — Legal, 72 h).
5. Run `pnpm security:audit` (dependency advisories, secret scan of the repo, NEXT_PUBLIC_ check) before closing.
