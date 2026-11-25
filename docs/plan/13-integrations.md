## 13. INTEGRATIONS

### 13.1 CRM sync (Attio, Affinity, Salesforce, HubSpot, Pipedrive, Airtable)
Adapter interface `{connect, listObjects, pull(cursor), push(records), fieldMap, webhooks?}` in `packages/integrations/crm/*` (or use Nango for OAuth + sync infra).
- **Pull setup**: choose objects (companies/people/deals), filters, field mapping → **match preview** ("5,535 matched & visible / unmatched") → confirm → store `crm_records` + matching to our entities.
- **Push setup**: target object, field mapping, dedupe key (domain/LinkedIn), create-or-update, owner assignment; push from grid, list, profile, extension, agent, MCP.
- **Scheduled enrichments**: write our fields back to CRM on cadence; saved searches can auto-push new matches.
- CRM dimensions become filters (CRM owner, lifecycle/deal stage, last activity, open deals); every record shows **In CRM / Not synced / In but not enriched** badge.
- **Activity log** of every push/pull with counts and errors.

### 13.2 Network tracking
Sources per user: LinkedIn connections via **official data export CSV upload** (contains name, company, position, connected-on, sometimes email — match quality is limited; show match rate) (and/or partner API where permitted), Gmail & Google Calendar (OAuth, metadata only: from/to/date — **restricted scopes require Google verification + annual CASA assessment, see H10**), Outlook & Microsoft Calendar (Graph). Build `network_edges` with strength (recency × frequency × channel). Team-wide merged & **deduped** view; "warmest path" ranking; alerts when a contact changes job / founds a company / gets investor interest ("{Company} hired from your network"). Privacy: per-user opt-in, never expose email content, admin can't see personal inbox data beyond edges.

### 13.3 Chrome extension (WXT, MV3)
- Toolbar/side panel: detects current site domain → company card (logo, rank, one-liner, HQ, founded, model chips, raised, key people, team size with Δ) → actions **Push to CRM / Add to list / Like / View in app**.
- ⚠️ **R3 + legal gate (H11):** LinkedIn's User Agreement prohibits extensions that scrape or modify its site. Build this content script behind a remote feature flag, default OFF. If legal says no, the side panel (which only reads the active tab's URL) is the whole extension.
- LinkedIn content script: on company & profile pages inject a "View on {{BRAND}}" button + inline metrics panel (team growth, funding history) — **read DOM only for the URL/ID of the page being viewed**, never bulk-scrape; comply with Chrome Web Store policy.
- Auth via app session (OAuth PKCE); uses public API with user's org credits.

### 13.4 Alerts & automation
Slack app (channel alerts, `/{{brand}} lookup` slash command), email (Resend), **Zapier** app (triggers: new search result, new signal; actions: enrich company/person, add to list), **webhooks** (Section 11), CSV export.

### 13.5 Bulk delivery
Per project: datasets (companies, people, investors, transactions, estimates), field selection, format CSV/Parquet, sink (S3 bucket w/ IAM role, GCS bucket, **Snowflake** via Secure Data Sharing or stage + COPY), cadence: full snapshot then **daily incrementals** (`{dataset}_YYYY-MM-DD.parquet`) with `op` column (upsert/delete) and stable IDs; manifest + checksums; estimates include P10/P50/P90, confidence and anchors.
