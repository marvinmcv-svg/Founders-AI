CREATE TABLE "entity_match_candidates" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"left_id" text NOT NULL,
	"right_id" text NOT NULL,
	"probability" real NOT NULL,
	"weight" real NOT NULL,
	"reason" text NOT NULL,
	"comparisons" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "entity_match_pair_uq" ON "entity_match_candidates" USING btree ("kind","left_id","right_id");--> statement-breakpoint
CREATE INDEX "entity_match_status_idx" ON "entity_match_candidates" USING btree ("status","probability");--> statement-breakpoint
-- Blocking keys for the resolution job (plan 9.1): registrable domain label and name prefix per country.
CREATE INDEX IF NOT EXISTS "companies_domain_label_idx" ON "companies" (split_part(lower("domain"), '.', 1)) WHERE "deleted_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "entity_match_candidates" ENABLE ROW LEVEL SECURITY;
