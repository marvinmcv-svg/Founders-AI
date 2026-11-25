## 0C. HUMAN-ONLY TASKS & INPUTS

The agent cannot do these. It builds against interfaces/mocks and lists them as `BLOCKED-HUMAN`.

| # | Needed for | Human task |
|---|---|---|
| H1 | Everything | Final brand name, domain, logo, colour tweaks, legal entity name |
| H2 | R1 | Cloud accounts (Vercel, Railway/Fly, managed Postgres, OpenSearch, Redis), DNS |
| H3 | R1 | Anthropic API key; Resend; Cal.com; PostHog; Sentry; Turnstile keys |
| H4 | R1 | Copy for every key in `/content/copy/en.json` (Section 17) |
| H5 | R1/R2 | **Data provider contracts** with **redistribution rights** for API/bulk (or decision to stay on public data only) |
| H6 | R1 | Privacy policy, terms, DPA, Legitimate Interest Assessment reviewed by a lawyer (people data = GDPR Art. 14) |
| H7 | R2 | Comparison/alternatives page facts verified and approved |
| H8 | R2 | Interest-signal source approval (legal + privacy) |
| H9 | R3 | OAuth apps + marketplace reviews: Salesforce, HubSpot, Attio, Affinity, Pipedrive, Airtable, Slack, Zapier |
| H10 | R3 | **Google OAuth verification + CASA security assessment** for Gmail/Calendar restricted scopes (weeks, paid); Microsoft publisher verification |
| H11 | R3 | Chrome Web Store developer account + review; legal check of LinkedIn page enrichment (LinkedIn's terms restrict extensions that scrape or alter its pages) |
| H12 | R3 | Snowflake / AWS / GCP accounts for bulk delivery tests |
| H13 | R1 | Stripe account, prices for seats and credit packs |
| H14 | Launch | Pen test vendor, SOC 2 auditor (optional at launch) |
