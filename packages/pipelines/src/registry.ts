import { highlightsJob } from "./jobs/highlights";
import { newsJob } from "./jobs/news";
import { talentJob } from "./jobs/talent";
import type { JobDef } from "./runner";

export const JOBS: Record<string, JobDef> = {
  [highlightsJob.name]: highlightsJob,
  [talentJob.name]: talentJob,
  [newsJob.name]: newsJob,
};

/** Order for `pnpm pipelines daily` (plan 9.8 freshness: signals < 24h, deltas daily). */
export const DAILY: string[] = ["talent", "news", "highlights"];
