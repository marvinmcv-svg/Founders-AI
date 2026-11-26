# Dependency audit — triage (2026-11-26)

`pnpm security:audit` runs `pnpm audit --prod`, a secret scan of tracked files and the `NEXT_PUBLIC_` allow-list. High/critical advisories must be fixed or triaged here (and in `ACCEPTED` in `scripts/security-audit.mjs`).

| Package | Severity | Path | Why it is accepted for now | Fix |
|---|---|---|---|---|
| tinypool | critical | app › better-auth › vitest › tinypool | Reached only through Better Auth's optional `vitest` peer; a test runner, never loaded by the app at runtime | Goes away when better-auth drops the peer or pnpm stops auto-installing it; or add `pnpm.overrides` once vitest ≥ 4.1.12 is adopted repo-wide |
| vitest, @vitest/mocker | moderate | same | Dev/test only | same |
| postcss | high | app/www › next › postcss | Build-time CSS processing of our own stylesheets; no untrusted CSS is ever processed | Next.js patch release bundling postcss ≥ 8.5.23 |
| sharp | high | app/www › next › sharp | `next/image` is not used, so no runtime image optimisation runs | Next.js release with sharp ≥ 0.35.5 |
| esbuild | moderate | drizzle-kit › @esbuild-kit | Dev CLI only | drizzle-kit update |
| @hono/node-server | moderate | api | Standalone API container only (Vercel serves the API through Next) | Upgrade to ≥ 2.1.3 with the next API release (major version: test first) |

Re-run before every release; an untriaged high/critical fails the script.
