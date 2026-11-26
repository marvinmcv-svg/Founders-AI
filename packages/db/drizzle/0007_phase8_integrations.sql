CREATE TABLE "bulk_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"datasets" text[] NOT NULL,
	"fields" jsonb,
	"format" text DEFAULT 'PARQUET' NOT NULL,
	"sink" text NOT NULL,
	"sink_config" text NOT NULL,
	"cadence" text DEFAULT 'DAILY' NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"watermark" timestamp with time zone,
	"last_outbox_id" bigint,
	"last_run" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bulk_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"delivery_id" text NOT NULL,
	"org_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"manifest" jsonb,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "crm_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"provider" text NOT NULL,
	"mode" text DEFAULT 'SANDBOX' NOT NULL,
	"auth" text,
	"pull_config" jsonb,
	"push_config" jsonb,
	"schedule" text DEFAULT 'OFF' NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"last_error" text,
	"pull_cursor" text,
	"last_pull_at" timestamp with time zone,
	"last_push_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_records" (
	"org_id" text NOT NULL,
	"provider" text NOT NULL,
	"object" text NOT NULL,
	"external_id" text NOT NULL,
	"name" text,
	"domain" text,
	"linkedin_url" text,
	"entity_type" text,
	"entity_id" text,
	"match_method" text,
	"owner" text,
	"stage" text,
	"last_activity" timestamp with time zone,
	"open_deals" integer DEFAULT 0 NOT NULL,
	"enriched_at" timestamp with time zone,
	"raw" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_records_org_id_provider_object_external_id_pk" PRIMARY KEY("org_id","provider","object","external_id")
);
--> statement-breakpoint
CREATE TABLE "crm_sandbox_objects" (
	"org_id" text NOT NULL,
	"provider" text NOT NULL,
	"object" text NOT NULL,
	"external_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_sandbox_objects_org_id_provider_object_external_id_pk" PRIMARY KEY("org_id","provider","object","external_id")
);
--> statement-breakpoint
CREATE TABLE "crm_sync_log" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"provider" text NOT NULL,
	"direction" text NOT NULL,
	"trigger" text DEFAULT 'manual' NOT NULL,
	"entity_count" integer DEFAULT 0 NOT NULL,
	"counts" jsonb,
	"status" text NOT NULL,
	"error" text,
	"actor" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"orgs" text[] DEFAULT '{}'::text[] NOT NULL,
	"note" text,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interest_signals" (
	"id" text PRIMARY KEY NOT NULL,
	"target_company_id" text,
	"target_person_id" text,
	"investor_id" text,
	"investor_type" text NOT NULL,
	"score" integer NOT NULL,
	"signal_date" date NOT NULL,
	"source_type" text NOT NULL,
	"evidence" text,
	"funding_context" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "network_edges" (
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"person_id" text NOT NULL,
	"strength" real NOT NULL,
	"last_interaction_at" timestamp with time zone,
	"sources" text[] DEFAULT '{}'::text[] NOT NULL,
	"evidence" jsonb NOT NULL,
	"company_id_at_sync" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "network_edges_org_id_user_id_person_id_pk" PRIMARY KEY("org_id","user_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "network_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"auth" text,
	"stats" jsonb,
	"last_sync" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "webhooks" ADD COLUMN "source" text DEFAULT 'api' NOT NULL;--> statement-breakpoint
CREATE INDEX "bulk_deliveries_org_idx" ON "bulk_deliveries" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "bulk_runs_delivery_idx" ON "bulk_runs" USING btree ("delivery_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_connections_org_provider_uq" ON "crm_connections" USING btree ("org_id","provider");--> statement-breakpoint
CREATE INDEX "crm_records_entity_idx" ON "crm_records" USING btree ("org_id","entity_id");--> statement-breakpoint
CREATE INDEX "crm_sync_log_org_idx" ON "crm_sync_log" USING btree ("org_id","at");--> statement-breakpoint
CREATE INDEX "interest_signals_company_idx" ON "interest_signals" USING btree ("target_company_id","signal_date");--> statement-breakpoint
CREATE INDEX "interest_signals_date_idx" ON "interest_signals" USING btree ("signal_date");--> statement-breakpoint
CREATE INDEX "network_edges_person_idx" ON "network_edges" USING btree ("org_id","person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "network_sources_user_provider_uq" ON "network_sources" USING btree ("org_id","user_id","provider");--> statement-breakpoint
-- Remote flags start OFF (plan 13.3 / 9.4 / H8, H11).
INSERT INTO "feature_flags" ("key", "enabled", "note") VALUES
  ('interest_signals', false, 'H8: legal + privacy approval of interest-signal sources'),
  ('extension_linkedin_panel', false, 'H11: legal check of LinkedIn page enrichment'),
  ('interest_telemetry', false, 'Plan 9.4 source (5): aggregated customer telemetry. Never on without H8 + contracts.')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Defence in depth (D-019): RLS on every table; the app role owns the tables, so it is unaffected.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;
--> statement-breakpoint
-- CRM / network matching keys on the normalised LinkedIn URL (`linkedin.<tld>/in/<slug>`).
CREATE INDEX IF NOT EXISTS "people_linkedin_norm_idx" ON "people" ((substring(lower("linkedin_url") from 'linkedin\.(?:com|invalid)/(?:in|company)/[^/?#]+')));
