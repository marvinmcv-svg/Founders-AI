CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "acquisitions" (
	"id" text PRIMARY KEY NOT NULL,
	"acquirer_id" text,
	"acquirer_name" text NOT NULL,
	"target_id" text NOT NULL,
	"date" date NOT NULL,
	"amount_usd" bigint,
	"status" text DEFAULT 'Completed' NOT NULL,
	"source_urls" text[] DEFAULT '{}'::text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"hash" text NOT NULL,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"domain" text NOT NULL,
	"domain_aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"tagline" text,
	"description" text,
	"founded_year" integer,
	"hq_city" text,
	"hq_state" text,
	"hq_country" text,
	"hq_region" text,
	"operating_status" text DEFAULT 'Active' NOT NULL,
	"growth_stage" text NOT NULL,
	"customer_focus" text,
	"business_models" text[] DEFAULT '{}'::text[] NOT NULL,
	"sector_id" text,
	"industry_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"tech_vertical_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"ecosystem_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"employee_count" integer,
	"employee_range" text,
	"rank" integer,
	"rank_score" real,
	"highlights" text[] DEFAULT '{}'::text[] NOT NULL,
	"new_highlights" text[] DEFAULT '{}'::text[] NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"bootstrapped" boolean DEFAULT false NOT NULL,
	"total_funding_usd" bigint,
	"last_funding_usd" bigint,
	"last_funding_date" date,
	"last_funding_type" text,
	"round_count" integer DEFAULT 0 NOT NULL,
	"post_money_valuation_usd" bigint,
	"investor_count" integer DEFAULT 0 NOT NULL,
	"web_visits" integer,
	"web_visits_growth_3m" real,
	"headcount_growth_3m" real,
	"headcount_growth_12m" real,
	"linkedin_followers" integer,
	"social_growth_3m" real,
	"est_revenue_usd" bigint,
	"est_valuation_usd" bigint,
	"patent_count" integer DEFAULT 0 NOT NULL,
	"trademark_count" integer DEFAULT 0 NOT NULL,
	"technologies" text[] DEFAULT '{}'::text[] NOT NULL,
	"certifications" text[] DEFAULT '{}'::text[] NOT NULL,
	"customer_profile" text,
	"traction_highlights" text,
	"contact_email" text,
	"socials" jsonb,
	"reviews" jsonb,
	"embedding" vector(256),
	"provenance" jsonb,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_competitors" (
	"company_id" text NOT NULL,
	"competitor_id" text NOT NULL,
	"overlap_score" real NOT NULL,
	"reason" text,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_competitors_company_id_competitor_id_pk" PRIMARY KEY("company_id","competitor_id")
);
--> statement-breakpoint
CREATE TABLE "company_estimates" (
	"company_id" text NOT NULL,
	"month" date NOT NULL,
	"revenue_p10" bigint,
	"revenue_p50" bigint,
	"revenue_p90" bigint,
	"revenue_type" text DEFAULT 'ARR' NOT NULL,
	"valuation_p10" bigint,
	"valuation_p50" bigint,
	"valuation_p90" bigint,
	"confidence" text NOT NULL,
	"drivers" jsonb,
	"model_version" text NOT NULL,
	CONSTRAINT "company_estimates_company_id_month_pk" PRIMARY KEY("company_id","month")
);
--> statement-breakpoint
CREATE TABLE "company_people" (
	"company_id" text NOT NULL,
	"person_id" text NOT NULL,
	"title" text,
	"department" text,
	"seniority" text,
	"is_founder" boolean DEFAULT false NOT NULL,
	"start" date,
	"end" date,
	"is_current" boolean DEFAULT true NOT NULL,
	CONSTRAINT "company_people_company_id_person_id_pk" PRIMARY KEY("company_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "credit_balances" (
	"org_id" text PRIMARY KEY NOT NULL,
	"balance" integer NOT NULL,
	"period_start" timestamp with time zone DEFAULT now() NOT NULL,
	"period_end" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "credit_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"operation" text,
	"request_id" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "digest_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"cadence" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"item_count" integer NOT NULL,
	"html" text
);
--> statement-breakpoint
CREATE TABLE "dsar_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"full_name" text,
	"type" text NOT NULL,
	"entity_id" text,
	"details" text,
	"status" text DEFAULT 'RECEIVED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_status" (
	"org_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"status_id" text NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entity_status_org_id_entity_id_pk" PRIMARY KEY("org_id","entity_id")
);
--> statement-breakpoint
CREATE TABLE "funding_rounds" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"type" text NOT NULL,
	"amount_usd" bigint,
	"currency" text DEFAULT 'USD' NOT NULL,
	"announced_date" date NOT NULL,
	"pre_money_usd" bigint,
	"post_money_usd" bigint,
	"source_urls" text[] DEFAULT '{}'::text[] NOT NULL,
	"provenance" jsonb
);
--> statement-breakpoint
CREATE TABLE "hides" (
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	CONSTRAINT "hides_org_id_user_id_entity_id_pk" PRIMARY KEY("org_id","user_id","entity_id")
);
--> statement-breakpoint
CREATE TABLE "investors" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"domain" text,
	"description" text,
	"hq_city" text,
	"hq_country" text,
	"founded_year" integer,
	"aum_usd" bigint,
	"check_min" bigint,
	"check_max" bigint,
	"target_stages" text[] DEFAULT '{}'::text[] NOT NULL,
	"geographies" text[] DEFAULT '{}'::text[] NOT NULL,
	"sectors" text[] DEFAULT '{}'::text[] NOT NULL,
	"investments_count" integer DEFAULT 0 NOT NULL,
	"exits_count" integer DEFAULT 0 NOT NULL,
	"leads_count" integer DEFAULT 0 NOT NULL,
	"follow_on_rate" real,
	"unicorn_count" integer DEFAULT 0 NOT NULL,
	"highlights" text[] DEFAULT '{}'::text[] NOT NULL,
	"person_id" text,
	"provenance" jsonb,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"inviter_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ipos" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"date" date NOT NULL,
	"exchange" text NOT NULL,
	"ticker" text NOT NULL,
	"share_price" real,
	"valuation_usd" bigint,
	"raised_usd" bigint
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"email" text NOT NULL,
	"company" text,
	"firm_type" text,
	"aum" text,
	"phone" text,
	"partnership_type" text,
	"message" text,
	"locale" text,
	"route" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "likes" (
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	CONSTRAINT "likes_org_id_user_id_entity_id_pk" PRIMARY KEY("org_id","user_id","entity_id")
);
--> statement-breakpoint
CREATE TABLE "list_items" (
	"list_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"added_by" text NOT NULL,
	"status" text,
	"custom_fields" jsonb,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "list_items_list_id_entity_id_pk" PRIMARY KEY("list_id","entity_id")
);
--> statement-breakpoint
CREATE TABLE "lists" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"entity_type" text NOT NULL,
	"visibility" text DEFAULT 'TEAM' NOT NULL,
	"system" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"agent_instructions" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_items" (
	"id" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"publisher" text NOT NULL,
	"title" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"body_hash" text
);
--> statement-breakpoint
CREATE TABLE "news_signals" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"news_item_id" text NOT NULL,
	"category" text NOT NULL,
	"summary" text NOT NULL,
	"score" real NOT NULL,
	"is_major" boolean DEFAULT false NOT NULL,
	"figures" jsonb,
	"published_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_statuses" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"label" text NOT NULL,
	"color" text NOT NULL,
	"order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" text,
	"plan" text DEFAULT 'trial' NOT NULL,
	"seats" integer DEFAULT 5 NOT NULL,
	"mcp_overage_enabled" boolean DEFAULT false NOT NULL,
	"thesis" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" text PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"first" text NOT NULL,
	"last" text NOT NULL,
	"headline" text,
	"bio" text,
	"location" text,
	"country" text,
	"linkedin_url" text,
	"x_url" text,
	"github_url" text,
	"avatar_url" text,
	"current_title" text,
	"current_company_id" text,
	"current_company_name" text,
	"department" text,
	"seniority" text,
	"years_experience" integer,
	"highlights" text[] DEFAULT '{}'::text[] NOT NULL,
	"education_summary" text,
	"followers" integer,
	"connections" integer,
	"talent_signal_count" integer DEFAULT 0 NOT NULL,
	"embedding" vector(256),
	"provenance" jsonb,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person_education" (
	"person_id" text NOT NULL,
	"school_id" text NOT NULL,
	"degree" text,
	"field" text,
	"start" integer,
	"end" integer,
	CONSTRAINT "person_education_person_id_school_id_pk" PRIMARY KEY("person_id","school_id")
);
--> statement-breakpoint
CREATE TABLE "person_emails" (
	"person_id" text NOT NULL,
	"email" text NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"source" text NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_emails_person_id_email_pk" PRIMARY KEY("person_id","email")
);
--> statement-breakpoint
CREATE TABLE "person_experience" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"company_id" text,
	"company_name" text NOT NULL,
	"title" text NOT NULL,
	"department" text,
	"start" date,
	"end" date,
	"is_current" boolean DEFAULT false NOT NULL,
	"is_founder" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revenue_disclosures" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"amount_usd" bigint NOT NULL,
	"type" text NOT NULL,
	"period" date NOT NULL,
	"source_url" text,
	"publisher" text,
	"published_at" timestamp with time zone,
	"verified_by" text,
	"status" text DEFAULT 'verified' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "round_investors" (
	"round_id" text NOT NULL,
	"investor_id" text NOT NULL,
	"is_lead" boolean DEFAULT false NOT NULL,
	CONSTRAINT "round_investors_round_id_investor_id_pk" PRIMARY KEY("round_id","investor_id")
);
--> statement-breakpoint
CREATE TABLE "saved_searches" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"product" text NOT NULL,
	"filter_ast" jsonb NOT NULL,
	"nl_query" text,
	"sort" jsonb,
	"visibility" text DEFAULT 'TEAM' NOT NULL,
	"alert_cadence" text DEFAULT 'OFF' NOT NULL,
	"channels" jsonb,
	"last_run_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schools" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"country" text,
	"tier" integer DEFAULT 2 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_reads" (
	"search_id" text NOT NULL,
	"reader_id" text NOT NULL,
	"last_read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_reads_search_id_reader_id_pk" PRIMARY KEY("search_id","reader_id")
);
--> statement-breakpoint
CREATE TABLE "search_result_snapshots" (
	"search_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_result_snapshots_search_id_entity_id_pk" PRIMARY KEY("search_id","entity_id")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "talent_signals" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"score" integer NOT NULL,
	"summary" text NOT NULL,
	"signal_date" date NOT NULL,
	"new_company_id" text,
	"prev_company_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"sources" jsonb
);
--> statement-breakpoint
CREATE TABLE "taxonomy_nodes" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"parent_id" text,
	"path" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text NOT NULL,
	"surface" text NOT NULL,
	"operation" text NOT NULL,
	"matched" boolean NOT NULL,
	"credits" integer NOT NULL,
	"latency_ms" integer,
	"request_id" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"timezone" text DEFAULT 'America/La_Paz' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "acquisitions_target_idx" ON "acquisitions" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "acquisitions_date_idx" ON "acquisitions" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_hash_uq" ON "api_keys" USING btree ("hash");--> statement-breakpoint
CREATE INDEX "api_keys_org_idx" ON "api_keys" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_domain_uq" ON "companies" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "companies_rank_idx" ON "companies" USING btree ("rank");--> statement-breakpoint
CREATE INDEX "companies_stage_idx" ON "companies" USING btree ("growth_stage");--> statement-breakpoint
CREATE INDEX "companies_country_idx" ON "companies" USING btree ("hq_country");--> statement-breakpoint
CREATE INDEX "companies_sector_idx" ON "companies" USING btree ("sector_id");--> statement-breakpoint
CREATE INDEX "companies_funding_idx" ON "companies" USING btree ("total_funding_usd");--> statement-breakpoint
CREATE INDEX "companies_last_funding_idx" ON "companies" USING btree ("last_funding_date");--> statement-breakpoint
CREATE INDEX "companies_name_trgm" ON "companies" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "companies_industry_gin" ON "companies" USING gin ("industry_ids");--> statement-breakpoint
CREATE INDEX "companies_vertical_gin" ON "companies" USING gin ("tech_vertical_ids");--> statement-breakpoint
CREATE INDEX "companies_highlights_gin" ON "companies" USING gin ("highlights");--> statement-breakpoint
CREATE INDEX "company_people_person_idx" ON "company_people" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "credit_ledger_org_idx" ON "credit_ledger" USING btree ("org_id","at");--> statement-breakpoint
CREATE INDEX "funding_rounds_company_idx" ON "funding_rounds" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "funding_rounds_date_idx" ON "funding_rounds" USING btree ("announced_date");--> statement-breakpoint
CREATE INDEX "funding_rounds_type_idx" ON "funding_rounds" USING btree ("type");--> statement-breakpoint
CREATE INDEX "investors_type_idx" ON "investors" USING btree ("type");--> statement-breakpoint
CREATE INDEX "investors_name_trgm" ON "investors" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "ipos_company_idx" ON "ipos" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "lists_org_idx" ON "lists" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "member_org_user_uq" ON "member" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "news_signals_company_idx" ON "news_signals" USING btree ("company_id","published_at");--> statement-breakpoint
CREATE INDEX "notes_entity_idx" ON "notes" USING btree ("org_id","entity_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "people_linkedin_uq" ON "people" USING btree ("linkedin_url");--> statement-breakpoint
CREATE INDEX "people_company_idx" ON "people" USING btree ("current_company_id");--> statement-breakpoint
CREATE INDEX "people_country_idx" ON "people" USING btree ("country");--> statement-breakpoint
CREATE INDEX "people_seniority_idx" ON "people" USING btree ("seniority");--> statement-breakpoint
CREATE INDEX "people_name_trgm" ON "people" USING gin ("full_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "people_highlights_gin" ON "people" USING gin ("highlights");--> statement-breakpoint
CREATE INDEX "person_emails_email_idx" ON "person_emails" USING btree ("email");--> statement-breakpoint
CREATE INDEX "person_experience_person_idx" ON "person_experience" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "revenue_disclosures_company_idx" ON "revenue_disclosures" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "round_investors_investor_idx" ON "round_investors" USING btree ("investor_id");--> statement-breakpoint
CREATE INDEX "saved_searches_org_idx" ON "saved_searches" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "talent_signals_person_idx" ON "talent_signals" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "talent_signals_date_idx" ON "talent_signals" USING btree ("signal_date");--> statement-breakpoint
CREATE INDEX "taxonomy_kind_idx" ON "taxonomy_nodes" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "taxonomy_parent_idx" ON "taxonomy_nodes" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "usage_events_org_idx" ON "usage_events" USING btree ("org_id","at");