-- company_metrics_daily: monthly range partitions (plan 0A). ClickHouse replaces this in R3.
CREATE TABLE IF NOT EXISTS company_metrics_daily (
  company_id text NOT NULL,
  metric text NOT NULL,
  date date NOT NULL,
  value real NOT NULL,
  PRIMARY KEY (company_id, metric, date)
) PARTITION BY RANGE (date);
--> statement-breakpoint
DO $$
DECLARE
  m date := date_trunc('month', current_date - interval '36 months')::date;
  stop date := date_trunc('month', current_date + interval '12 months')::date;
BEGIN
  WHILE m <= stop LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF company_metrics_daily FOR VALUES FROM (%L) TO (%L)',
      'company_metrics_daily_' || to_char(m, 'YYYY_MM'), m, (m + interval '1 month')::date
    );
    m := (m + interval '1 month')::date;
  END LOOP;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS company_metrics_daily_default PARTITION OF company_metrics_daily DEFAULT;
--> statement-breakpoint
-- platform_stats: every public number on the marketing site reads from here (plan 1.2).
CREATE MATERIALIZED VIEW IF NOT EXISTS platform_stats AS
SELECT
  1 AS id,
  (SELECT count(*) FROM companies WHERE deleted_at IS NULL)::bigint AS companies,
  (SELECT count(*) FROM people WHERE deleted_at IS NULL)::bigint AS people,
  (SELECT count(*) FROM investors WHERE deleted_at IS NULL)::bigint AS investors,
  ((SELECT count(*) FROM funding_rounds) + (SELECT count(*) FROM acquisitions) + (SELECT count(*) FROM ipos))::bigint AS transactions,
  (SELECT count(*) FROM funding_rounds)::bigint AS funding_rounds,
  (SELECT count(*) FROM talent_signals)::bigint AS talent_signals,
  (SELECT count(*) FROM talent_signals WHERE signal_date >= current_date - 7)::bigint AS talent_signals_7d,
  (SELECT count(*) FROM funding_rounds WHERE announced_date >= current_date - 30)::bigint AS rounds_30d,
  (SELECT count(*) FROM news_signals)::bigint AS news_signals,
  (SELECT count(DISTINCT publisher) FROM news_items)::bigint AS news_sources,
  (SELECT count(*) FROM revenue_disclosures WHERE status = 'verified')::bigint AS revenue_disclosures,
  (SELECT count(*) FROM companies WHERE hq_region = 'Latin America' AND deleted_at IS NULL)::bigint AS latam_companies,
  (SELECT count(DISTINCT hq_country) FROM companies WHERE deleted_at IS NULL)::bigint AS countries,
  now() AS refreshed_at;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS platform_stats_id ON platform_stats (id);
