CREATE TABLE "agent_artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"thread_id" text,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"content" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"org_id" text NOT NULL,
	"role" text NOT NULL,
	"author_id" text,
	"text" text DEFAULT '' NOT NULL,
	"transcript" jsonb,
	"steps" jsonb,
	"sources" jsonb,
	"tables" jsonb,
	"artifact_ids" text[],
	"pending" jsonb,
	"status" text DEFAULT 'done' NOT NULL,
	"engine" text,
	"skill_slug" text,
	"usage" jsonb,
	"unsourced" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_preferences" (
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"instructions" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_preferences_org_id_user_id_pk" PRIMARY KEY("org_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "agent_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"visibility" text DEFAULT 'PRIVATE' NOT NULL,
	"allowed_tools" text[] DEFAULT '{}'::text[] NOT NULL,
	"context" jsonb,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"skill_slug" text NOT NULL,
	"prompt" text DEFAULT '' NOT NULL,
	"cadence" text NOT NULL,
	"weekday" integer,
	"hour" integer DEFAULT 7 NOT NULL,
	"timezone" text DEFAULT 'America/La_Paz' NOT NULL,
	"channels" text[] DEFAULT '{in_app}'::text[] NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_thread_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"steps" text[] NOT NULL,
	"inputs" jsonb,
	"output_format" text DEFAULT '' NOT NULL,
	"visibility" text DEFAULT 'PRIVATE' NOT NULL,
	"status" text DEFAULT 'SAVED' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "agent_artifacts_org_idx" ON "agent_artifacts" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_messages_thread_idx" ON "agent_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_threads_org_idx" ON "agent_threads" USING btree ("org_id","updated_at");--> statement-breakpoint
CREATE INDEX "skill_schedules_org_idx" ON "skill_schedules" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "skills_org_slug_uq" ON "skills" USING btree ("org_id","slug") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "skills_org_idx" ON "skills" USING btree ("org_id");--> statement-breakpoint
-- Defence in depth (D-019): RLS on every table; the app role owns the tables, so it is unaffected.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;
