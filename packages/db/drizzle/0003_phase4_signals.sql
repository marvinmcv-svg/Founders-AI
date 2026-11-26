CREATE TABLE "alert_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"search_id" text,
	"user_id" text,
	"channel" text NOT NULL,
	"status" text NOT NULL,
	"item_count" integer NOT NULL,
	"error" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "highlight_events" (
	"entity_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"highlight" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "highlight_events_entity_id_highlight_added_at_pk" PRIMARY KEY("entity_id","highlight","added_at")
);
--> statement-breakpoint
CREATE TABLE "model_versions" (
	"version" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"metrics" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_raw" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"url" text NOT NULL,
	"publisher" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"simhash" text NOT NULL,
	"status" text DEFAULT 'NEW' NOT NULL,
	"duplicate_of" text,
	"label" jsonb,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_integrations" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"provider" text NOT NULL,
	"label" text,
	"secret" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "outbox_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"product" text NOT NULL,
	"entity_id" text NOT NULL,
	"kind" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"alerts_processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "person_changes" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"source" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	"label" text,
	"processed_at" timestamp with time zone,
	"signal_id" text
);
--> statement-breakpoint
CREATE TABLE "pipeline_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"job" text NOT NULL,
	"status" text NOT NULL,
	"trigger" text DEFAULT 'manual' NOT NULL,
	"counts" jsonb,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "reviews_detail" jsonb;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "traction" jsonb;--> statement-breakpoint
ALTER TABLE "company_competitors" ADD COLUMN "model_version" text DEFAULT 'v0-taxonomy' NOT NULL;--> statement-breakpoint
ALTER TABLE "news_signals" ADD COLUMN "model_version" text DEFAULT 'v0-seed' NOT NULL;--> statement-breakpoint
ALTER TABLE "revenue_disclosures" ADD COLUMN "origin" text DEFAULT 'seed' NOT NULL;--> statement-breakpoint
ALTER TABLE "revenue_disclosures" ADD COLUMN "news_signal_id" text;--> statement-breakpoint
ALTER TABLE "revenue_disclosures" ADD COLUMN "evidence" text;--> statement-breakpoint
ALTER TABLE "revenue_disclosures" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "revenue_disclosures" ADD COLUMN "created_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "talent_signals" ADD COLUMN "facts" jsonb;--> statement-breakpoint
ALTER TABLE "talent_signals" ADD COLUMN "model_version" text DEFAULT 'v0-seed' NOT NULL;--> statement-breakpoint
ALTER TABLE "talent_signals" ADD COLUMN "created_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
CREATE INDEX "alert_deliveries_org_idx" ON "alert_deliveries" USING btree ("org_id","at");--> statement-breakpoint
CREATE INDEX "highlight_events_open_idx" ON "highlight_events" USING btree ("entity_id") WHERE removed_at IS NULL;--> statement-breakpoint
CREATE INDEX "model_versions_kind_idx" ON "model_versions" USING btree ("kind");--> statement-breakpoint
CREATE UNIQUE INDEX "news_raw_url_uq" ON "news_raw" USING btree ("url");--> statement-breakpoint
CREATE INDEX "news_raw_status_idx" ON "news_raw" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "org_integrations_org_provider_uq" ON "org_integrations" USING btree ("org_id","provider");--> statement-breakpoint
CREATE INDEX "outbox_alerts_pending_idx" ON "outbox_events" USING btree ("id") WHERE alerts_processed_at IS NULL;--> statement-breakpoint
CREATE INDEX "person_changes_pending_idx" ON "person_changes" USING btree ("observed_at") WHERE processed_at IS NULL;--> statement-breakpoint
CREATE INDEX "pipeline_runs_job_idx" ON "pipeline_runs" USING btree ("job","started_at");--> statement-breakpoint
-- Competitors v1: approximate kNN over company embeddings (cosine).
CREATE INDEX IF NOT EXISTS "companies_embedding_hnsw" ON "companies" USING hnsw ("embedding" vector_cosine_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "revenue_disclosures_status_idx" ON "revenue_disclosures" USING btree ("status");
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
CREATE INDEX IF NOT EXISTS "news_items_url_idx" ON "news_items" USING btree ("url");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "news_signals_published_idx" ON "news_signals" USING btree ("published_at");
--> statement-breakpoint
-- Versioned estimates (plan 9.6): v0 and v1 rows coexist; the active REVENUE model is what users see.
ALTER TABLE "company_estimates" DROP CONSTRAINT IF EXISTS "company_estimates_company_id_month_pk";
--> statement-breakpoint
ALTER TABLE "company_estimates" ADD CONSTRAINT "company_estimates_company_id_month_model_version_pk" PRIMARY KEY ("company_id", "month", "model_version");
--> statement-breakpoint
INSERT INTO "model_versions" ("version", "kind", "active", "metrics")
VALUES ('v0-heuristic', 'REVENUE', true, '{"description": "Headcount × revenue-per-employee prior (plan 9.6 v0)"}')
ON CONFLICT ("version") DO NOTHING;
