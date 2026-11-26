/** Scheduled agent skills (plan 10.1): run due `/skill` schedules and deliver the answers. */
import { runScheduledSkills } from "@founders/agent";
import type { JobDef } from "../runner";

export const agentSchedulesJob: JobDef = {
  name: "agent-schedules",
  description: "Run scheduled agent skills that are due (in each user's timezone) and deliver them in-app and to Slack",
  async run(ctx) {
    const r = await runScheduledSkills({ anyHour: Boolean(ctx.options.anyHour) });
    for (const [k, v] of Object.entries(r)) ctx.count(k, v);
  },
};
