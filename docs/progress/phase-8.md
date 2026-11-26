# Phase 8 — Integrations (R3)

Started 2026-11-26 ("R2 approved, start the next phase", D-051). Plan sections: 13, 15 (Phase 8), 8 (data model), 7.3/7.4/7.6 (CRM & network in grids, filters, alerts), 9.4 (interest signals), 0C (H8–H12).

## Tasks
| # | Task | Main files | Status |
|---|---|---|---|
| 8.0 | Migration 0007: `crm_connections`, `crm_records`, `crm_sync_log`, `crm_sandbox_objects`, `network_sources`, `network_edges`, `bulk_deliveries`, `bulk_runs`, `interest_signals`, `feature_flags` (+ `webhooks.source`), normalised-LinkedIn index, RLS on | `packages/db/drizzle/0007_phase8_integrations.sql` | done (local) |
| 8.1 | CRM adapters ×6 (Attio, Affinity, Salesforce, HubSpot, Pipedrive, Airtable): spec (native shapes, field map, dedupe key) + live REST client over the egress proxy + sandbox client (D-052) | `packages/integrations/src/crm/*` | done |
| 8.1b | Sync engine: connect (sandbox / API token), match preview, pull (domain → LinkedIn → email → exact name), push create-or-update, scheduled enrichment (`crm-sync` daily job), activity log, `crm.sync` webhook, "My CRM" system list | `packages/core/src/repo/crm.ts` | done |
| 8.1c | App: Settings → CRM (connect, preview, pull, push settings, field map, schedule, log); CRM badges + "Push to CRM" on grids and profiles; CRM filters (status, provider, owner, stage, last activity, open deals); CRM auto-push alert channel; agent `push_to_crm` write tool | `apps/app/src/components/integrations/*` | done |
| 8.2 | Network tracking | — | next |
| 8.3 | Zapier app + bulk delivery | — | |
| 8.4 | Interest signals (flag), Chrome extension, Integrations page | — | |

## Acceptance evidence (2026-11-26, local)
| Plan 15 Phase 8 criterion | Result |
|---|---|
| Round-trip sync test per CRM sandbox | `packages/integrations/test/crm.test.ts`: for each of the 6 providers, seed a sandbox book in the vendor's native shapes → pull through the adapter (paged) → push update + create → pull again: create-vs-update correct, mapped fields written, existing fields kept, no duplicates; custom field maps honoured, dedupe key always written. Live clients: request shapes, hosts and auth headers per vendor; 401 aborts, other errors per record. |
| Pull / push / match preview / schedule / log | `packages/core/test/crm.test.ts` (DB): sandbox connect → preview (writes nothing) → pull → badges → push (2 updated, 3 created) → CRM filters (and no cross-org leak) → scheduled enrichment → disconnect cleans up. `e2e/tests/app.phase8.spec.ts`: the same through the UI. |
| Real vendor accounts | **BLOCKED-HUMAN (H9)**: OAuth apps + marketplace reviews. API-token mode works today for Attio, Affinity, HubSpot (private app token), Pipedrive and Airtable; Salesforce needs the OAuth app. |

Screenshots: `docs/progress/screens/phase-8-crm-preview.png`, `phase-8-crm-grid.png`, `phase-8-crm-settings.png`.
