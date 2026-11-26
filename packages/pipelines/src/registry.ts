import { highlightsJob } from "./jobs/highlights";
import type { JobDef } from "./runner";

export const JOBS: Record<string, JobDef> = {
  [highlightsJob.name]: highlightsJob,
};

/** Order for `pnpm pipelines daily` (plan 9.8 freshness: signals < 24h, deltas daily). */
export const DAILY: string[] = ["highlights"];
