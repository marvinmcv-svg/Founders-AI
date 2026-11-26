import { competitorsJob } from "./jobs/competitors";
import { highlightsJob } from "./jobs/highlights";
import { newsJob } from "./jobs/news";
import { talentJob } from "./jobs/talent";
import type { JobDef } from "./runner";

export const JOBS: Record<string, JobDef> = {
  [highlightsJob.name]: highlightsJob,
  [talentJob.name]: talentJob,
  [newsJob.name]: newsJob,
  [competitorsJob.name]: competitorsJob,
};

/** Order for `pnpm pipelines daily` (plan 9.8 freshness: signals < 24h, deltas daily). */
export const DAILY: string[] = ["talent", "news", "highlights"];

/** Weekly (plan 9.7: competitors recomputed weekly). */
export const WEEKLY: string[] = ["competitors"];
