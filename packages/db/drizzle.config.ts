import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";
config({ path: "../../.env" });

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/founders" },
  // company_metrics_daily is created as a monthly-partitioned table by a custom migration.
  tablesFilter: ["!company_metrics_daily*"],
});
