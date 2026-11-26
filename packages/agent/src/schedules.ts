/**
 * Scheduled skills (plan 10.1): run a skill on a cadence (e.g. /weekly-brief every Monday 07:00 in
 * the user's timezone) and deliver the answer in-app and to Slack. Called by the `agent-schedules`
 * pipeline job; `anyHour` runs everything due today (for hosts limited to a daily cron).
 */
import { brand } from "@founders/config";
import * as repo from "@founders/core/repo";
import { ask } from "./runtime";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function scheduleDue(s: Pick<repo.ScheduleRow, "cadence" | "weekday" | "hour" | "timezone" | "last_run_at">, now: Date, anyHour = false): boolean {
  const t = repo.localTime(now, s.timezone);
  if (!anyHour && t.hour !== s.hour) return false;
  if (s.cadence === "WEEKLY" && WEEKDAYS[s.weekday ?? 1] !== t.weekday) return false;
  if (s.last_run_at && repo.localTime(new Date(s.last_run_at), s.timezone).date === t.date) return false;
  return true;
}

export async function runScheduledSkills(opts: { now?: Date; anyHour?: boolean } = {}) {
  const now = opts.now ?? new Date();
  const counts = { schedules: 0, ran: 0, failed: 0, slack: 0 };
  for (const s of await repo.allActiveSchedules()) {
    counts.schedules++;
    if (!scheduleDue(s, now, opts.anyHour)) continue;
    const ctx: repo.OrgContext = { orgId: s.org_id, userId: s.user_id, role: s.role as repo.Role };
    try {
      const r = await ask(ctx, `/${s.skill_slug}${s.prompt ? ` ${s.prompt}` : ""}`);
      await repo.markScheduleRun(s.id, r.threadId);
      counts.ran++;
      if (s.channels.includes("in_app")) await repo.notify(ctx, "agent.scheduled", { threadId: r.threadId, name: `/${s.skill_slug}`, count: 1 });
      if (s.channels.includes("slack")) {
        const link = `${brand.urls.app}/agent/${r.threadId}`;
        const text = r.message.text.replace(/\[\[[^\]]+\]\]/g, "").slice(0, 3000);
        if (await repo.postSlackText(s.org_id, `*/${s.skill_slug}* — ${brand.name}\n${text}\n<${link}|Open in ${brand.name}>`).catch(() => false)) counts.slack++;
      }
    } catch {
      counts.failed++;
    }
  }
  return counts;
}
