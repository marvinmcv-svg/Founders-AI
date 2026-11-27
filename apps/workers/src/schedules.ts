/**
 * What runs when (plan 0A: "cron via BullMQ repeatable jobs"; D-023/D-076). Derived from the
 * pipelines registry so a job added to DAILY/WEEKLY/… is scheduled without touching this file.
 * All patterns are UTC.
 */
import { DAILY, DAILY_WORKER, JOBS, MINUTELY_WORKER, MONTHLY, WEEKLY } from "@founders/pipelines";

export type Schedule = {
  /** BullMQ job-scheduler id (stable: changing it creates a second schedule). */
  id: string;
  /** Queue: `realtime` (short, frequent) never waits behind `batch` (long runs). */
  queue: "realtime" | "batch";
  pattern: string;
  /** Pipeline jobs, run in order; a failed job does not stop the rest. */
  jobs: string[];
};

export const SCHEDULES: Schedule[] = [
  { id: "minutely", queue: "realtime", pattern: "* * * * *", jobs: MINUTELY_WORKER },
  // Same minute as the Vercel cron (apps/app/vercel.json); jobs are idempotent, so running both is safe.
  { id: "daily", queue: "batch", pattern: "17 11 * * *", jobs: [...DAILY.filter((j) => !MINUTELY_WORKER.includes(j)), ...DAILY_WORKER] },
  { id: "weekly", queue: "batch", pattern: "37 3 * * 1", jobs: WEEKLY },
  { id: "monthly", queue: "batch", pattern: "7 4 1 * *", jobs: MONTHLY },
];

export const QUEUES = ["realtime", "batch"] as const;

/** Every scheduled name must be a real job (checked at start-up and in tests). */
export function unknownJobs(schedules: Schedule[] = SCHEDULES): string[] {
  return schedules.flatMap((s) => s.jobs).filter((j) => !JOBS[j]);
}
