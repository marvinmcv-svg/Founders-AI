CREATE TABLE "sec_filings" (
	"accession" text PRIMARY KEY NOT NULL,
	"cik" text NOT NULL,
	"form_type" text NOT NULL,
	"filed_date" date NOT NULL,
	"issuer_name" text NOT NULL,
	"outcome" text NOT NULL,
	"skip_reason" text,
	"company_id" text,
	"investor_id" text,
	"round_id" text,
	"date_of_first_sale" date,
	"amount_sold_usd" bigint,
	"previous_accession" text,
	"parsed" jsonb NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "sec_filings_cik_idx" ON "sec_filings" USING btree ("cik","date_of_first_sale");--> statement-breakpoint
CREATE INDEX "sec_filings_filed_idx" ON "sec_filings" USING btree ("filed_date");--> statement-breakpoint
ALTER TABLE "sec_filings" ENABLE ROW LEVEL SECURITY;
