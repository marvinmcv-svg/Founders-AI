CREATE TABLE "billing_accounts" (
	"org_id" text PRIMARY KEY NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"subscription_status" text DEFAULT 'none' NOT NULL,
	"billing_email" text,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"period_credits" integer DEFAULT 0 NOT NULL,
	"rollover_pct" integer DEFAULT 100 NOT NULL,
	"rollover_cap" integer DEFAULT 0 NOT NULL,
	"overage_enabled" boolean DEFAULT false NOT NULL,
	"last_reset_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_accounts_stripe_customer_id_unique" UNIQUE("stripe_customer_id")
);
--> statement-breakpoint
CREATE TABLE "dsar_events" (
	"id" text PRIMARY KEY NOT NULL,
	"dsar_id" text NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"note" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scim_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"hash" text NOT NULL,
	"created_by" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scim_tokens_hash_unique" UNIQUE("hash")
);
--> statement-breakpoint
CREATE TABLE "scim_users" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"external_id" text,
	"user_name" text NOT NULL,
	"display_name" text,
	"active" boolean DEFAULT true NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signal_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"signal_id" text NOT NULL,
	"verdict" text NOT NULL,
	"original_label" text,
	"corrected_label" text,
	"note" text,
	"reviewer" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sso_provider" (
	"id" text PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"oidc_config" text,
	"saml_config" text,
	"user_id" text,
	"provider_id" text NOT NULL,
	"organization_id" text,
	"domain" text NOT NULL,
	"domain_verified" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "sso_provider_provider_id_unique" UNIQUE("provider_id")
);
--> statement-breakpoint
CREATE TABLE "status_incidents" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"impact" text NOT NULL,
	"components" text[] DEFAULT '{}'::text[] NOT NULL,
	"updates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stripe_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"org_id" text,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "suppression_list" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"value_hash" text NOT NULL,
	"reason" text NOT NULL,
	"dsar_id" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL,
	"verified" boolean DEFAULT true,
	"failed_verification_count" integer DEFAULT 0,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "usage_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"identifier" text NOT NULL,
	"credits" integer NOT NULL,
	"ledger_rows" integer NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_reports_identifier_unique" UNIQUE("identifier")
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "actor_type" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "ip" text;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "user_agent" text;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "seq" bigint;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "prev_hash" text;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "hash" text;--> statement-breakpoint
ALTER TABLE "credit_balances" ADD COLUMN "overage_limit" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD COLUMN "overage" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD COLUMN "reported_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dsar_requests" ADD COLUMN "linkedin_url" text;--> statement-breakpoint
ALTER TABLE "dsar_requests" ADD COLUMN "due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dsar_requests" ADD COLUMN "verify_token_hash" text;--> statement-breakpoint
ALTER TABLE "dsar_requests" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dsar_requests" ADD COLUMN "matched_person_ids" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "dsar_requests" ADD COLUMN "handled_by" text;--> statement-breakpoint
ALTER TABLE "dsar_requests" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dsar_requests" ADD COLUMN "result" jsonb;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "require_sso" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "require_2fa" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "two_factor_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "sso_provider" ADD CONSTRAINT "sso_provider_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dsar_events_dsar_idx" ON "dsar_events" USING btree ("dsar_id","at");--> statement-breakpoint
CREATE INDEX "scim_tokens_org_idx" ON "scim_tokens" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scim_users_org_user_uq" ON "scim_users" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scim_users_org_username_uq" ON "scim_users" USING btree ("org_id","user_name");--> statement-breakpoint
CREATE UNIQUE INDEX "scim_users_org_external_uq" ON "scim_users" USING btree ("org_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "signal_reviews_kind_signal_uq" ON "signal_reviews" USING btree ("kind","signal_id");--> statement-breakpoint
CREATE INDEX "signal_reviews_kind_at_idx" ON "signal_reviews" USING btree ("kind","at");--> statement-breakpoint
CREATE INDEX "status_incidents_created_idx" ON "status_incidents" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "suppression_kind_hash_uq" ON "suppression_list" USING btree ("kind","value_hash");--> statement-breakpoint
CREATE INDEX "two_factor_user_idx" ON "two_factor" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "two_factor_secret_idx" ON "two_factor" USING btree ("secret");--> statement-breakpoint
CREATE INDEX "usage_reports_org_idx" ON "usage_reports" USING btree ("org_id","at");--> statement-breakpoint
CREATE INDEX "audit_log_org_at_idx" ON "audit_log" USING btree ("org_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_log_org_seq_uq" ON "audit_log" USING btree ("org_id","seq");--> statement-breakpoint
-- Suppression (plan 14.5): hashes of normalised values; the same normalisation lives in core/privacy.ts.
CREATE OR REPLACE FUNCTION founders_sha256(v text) RETURNS text LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT encode(sha256(convert_to(v, 'UTF8')), 'hex')
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION founders_norm_linkedin(url text) RETURNS text LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT substring(lower(url) from 'linkedin\.(?:com|invalid)/(?:in|company)/[^/?#]+')
$$;
--> statement-breakpoint
-- Re-ingestion guard: a suppressed person (by id or LinkedIn URL) or email is silently skipped on insert.
CREATE OR REPLACE FUNCTION suppression_guard_people() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM suppression_list s
    WHERE (s.kind = 'person_id' AND s.value_hash = founders_sha256(NEW.id))
       OR (s.kind = 'linkedin' AND NEW.linkedin_url IS NOT NULL AND s.value_hash = founders_sha256(founders_norm_linkedin(NEW.linkedin_url)))
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER people_suppression_guard BEFORE INSERT ON people FOR EACH ROW EXECUTE FUNCTION suppression_guard_people();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION suppression_guard_person_emails() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM suppression_list s
    WHERE (s.kind = 'email' AND s.value_hash = founders_sha256(lower(trim(NEW.email))))
       OR (s.kind = 'person_id' AND s.value_hash = founders_sha256(NEW.person_id))
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER person_emails_suppression_guard BEFORE INSERT ON person_emails FOR EACH ROW EXECUTE FUNCTION suppression_guard_person_emails();
--> statement-breakpoint
-- Rows keyed to a suppressed person id (history, roles, signals, changes) are dropped too.
CREATE OR REPLACE FUNCTION suppression_guard_person_rows() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM suppression_list s WHERE s.kind = 'person_id' AND s.value_hash = founders_sha256(NEW.person_id)) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER person_experience_suppression_guard BEFORE INSERT ON person_experience FOR EACH ROW EXECUTE FUNCTION suppression_guard_person_rows();
--> statement-breakpoint
CREATE TRIGGER company_people_suppression_guard BEFORE INSERT ON company_people FOR EACH ROW EXECUTE FUNCTION suppression_guard_person_rows();
--> statement-breakpoint
CREATE TRIGGER talent_signals_suppression_guard BEFORE INSERT ON talent_signals FOR EACH ROW EXECUTE FUNCTION suppression_guard_person_rows();
--> statement-breakpoint
CREATE TRIGGER person_changes_suppression_guard BEFORE INSERT ON person_changes FOR EACH ROW EXECUTE FUNCTION suppression_guard_person_rows();
--> statement-breakpoint
CREATE TRIGGER person_education_suppression_guard BEFORE INSERT ON person_education FOR EACH ROW EXECUTE FUNCTION suppression_guard_person_rows();
--> statement-breakpoint
-- Audit log is append-only (plan 14.4). Retention jobs and the demo reseed set founders.audit_maintenance = on.
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('founders.audit_maintenance', true), '') = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'audit_log is append-only';
END $$;
--> statement-breakpoint
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
--> statement-breakpoint
UPDATE dsar_requests SET due_at = created_at + interval '30 days' WHERE due_at IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dsar_requests_status_due_idx" ON "dsar_requests" ("status", "due_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_ledger_unreported_idx" ON "credit_ledger" ("org_id") WHERE "reported_at" IS NULL AND "overage" > 0;
--> statement-breakpoint
-- Defence in depth (D-019): RLS on every table.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;
