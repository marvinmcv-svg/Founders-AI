import { alertsJob, digestsJob } from "./jobs/alerts";
import { competitorsJob } from "./jobs/competitors";
import { highlightsJob } from "./jobs/highlights";
import { newsJob } from "./jobs/news";
import { talentJob } from "./jobs/talent";
import { tractionJob } from "./jobs/traction";
import { webhooksJob } from "./jobs/webhooks";
import { agentSchedulesJob } from "./jobs/agent";
import { bulkJob, crmSyncJob, networkJob } from "./jobs/integrations";
import { interestJob } from "./jobs/interest";
import { billingUsageJob, privacySlaJob } from "./jobs/compliance";
import type { JobDef } from "./runner";

export const JOBS: Record<string, JobDef> = {
  [highlightsJob.name]: highlightsJob,
  [talentJob.name]: talentJob,
  [newsJob.name]: newsJob,
  [competitorsJob.name]: competitorsJob,
  [tractionJob.name]: tractionJob,
  [alertsJob.name]: alertsJob,
  [digestsJob.name]: digestsJob,
  [webhooksJob.name]: webhooksJob,
  [agentSchedulesJob.name]: agentSchedulesJob,
  [crmSyncJob.name]: crmSyncJob,
  [networkJob.name]: networkJob,
  [bulkJob.name]: bulkJob,
  [interestJob.name]: interestJob,
  [billingUsageJob.name]: billingUsageJob,
  [privacySlaJob.name]: privacySlaJob,
};

/** Order for `pnpm pipelines daily` (plan 9.8 freshness: signals < 24h, deltas daily). */
export const DAILY: string[] = ["talent", "news", "highlights", "alerts", "webhooks", "digests", "agent-schedules", "interest", "crm-sync", "network", "bulk", "billing-usage", "privacy-sla"];

/** Weekly (plan 9.7: competitors recomputed weekly). */
export const WEEKLY: string[] = ["competitors"];

/** Monthly (plan 9.8: traffic panels and estimates refresh monthly). */
export const MONTHLY: string[] = ["traction"];
