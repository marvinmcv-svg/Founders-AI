## 16. TESTING & QA STRATEGY

- **Unit** (Vitest): filter AST → DSL compiler (every operator), credit engine, entity resolver, scoring functions, NL→filter validator.
- **Contract**: OpenAPI-driven tests (Schemathesis) for API; MCP tool schemas.
- **E2E** (Playwright): marketing navigation, forms; app flows in Phase 3; agent smoke tests with recorded tool fixtures.
- **Visual regression**: Playwright screenshots of every marketing section at 4 breakpoints vs **our own** approved baselines. Parity with the reference is checked structurally (section IDs), not by pixels.
- **Tenancy tests**: cross-org access attempts on every repo function, API route and MCP tool.
- **Agent evals**: Section 10 harness in CI.
- **Data quality**: SQL data-quality checks in `packages/db/quality`, run nightly and in CI on the seed (nulls, ranges, duplicate rates, freshness), labelled samples for signals precision.
- **ML**: backtests for revenue/valuation, calibration plots, drift monitors.
- **Load**: k6 for API & search.
- **Security**: SAST, DAST (ZAP), dependency audit, pen test.
- **Accessibility**: axe in CI; manual keyboard & screen-reader pass.
- **REA on our own build**: rerun the Phase 0 REA captures on our staging site and diff route inventory, network endpoints and module graph against `recon/` to catch missing pages/interactions.
