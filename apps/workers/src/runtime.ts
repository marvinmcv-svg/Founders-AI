/**
 * BullMQ runtime (D-076): two queues, repeatable job schedulers from SCHEDULES, one worker per queue
 * (concurrency 1, so a schedule never overlaps itself), every job run through the pipelines'
 * `runJob` (logged in pipeline_runs exactly like the CLI and the cron route).
 */
import { Queue, Worker, type ConnectionOptions, type Job } from "bullmq";
import { JOBS, runJob, type RunResult } from "@founders/pipelines";
import { QUEUES, SCHEDULES, unknownJobs, type Schedule } from "./schedules";

export type SequenceData = { jobs: string[]; options?: Record<string, string | number | boolean>; trigger?: string };
export type SequenceResult = { results: Pick<RunResult, "job" | "status" | "ms" | "counts">[] };

export const QUEUE_PREFIX = process.env.WORKERS_QUEUE_PREFIX ?? "founders";

export function redisConnection(url = process.env.REDIS_URL): ConnectionOptions {
  if (!url) throw new Error("REDIS_URL is not set");
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: u.pathname.length > 1 ? Number(u.pathname.slice(1)) : 0,
    tls: u.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null, // required by BullMQ workers
  };
}

/** Run a sequence of pipeline jobs; throws (so BullMQ records a failure) if any job failed. */
export async function processSequence(job: Pick<Job<SequenceData>, "data" | "updateProgress">, run: typeof runJob = runJob): Promise<SequenceResult> {
  const results: SequenceResult["results"] = [];
  for (const name of job.data.jobs) {
    const def = JOBS[name];
    if (!def) {
      results.push({ job: name, status: "FAILED", ms: 0, counts: {} });
      continue;
    }
    const r = await run(def, { trigger: job.data.trigger ?? "worker", options: job.data.options ?? {}, quiet: true });
    results.push({ job: r.job, status: r.status, ms: r.ms, counts: r.counts });
    await job.updateProgress(Math.round((results.length / job.data.jobs.length) * 100));
  }
  const failed = results.filter((r) => r.status === "FAILED").map((r) => r.job);
  if (failed.length) throw new Error(`Failed: ${failed.join(", ")} (see pipeline_runs)`);
  return { results };
}

export type Runtime = { queues: Record<(typeof QUEUES)[number], Queue>; workers: Worker[]; close: () => Promise<void> };

/** Upsert every schedule (idempotent on restart) and drop schedulers that are no longer defined. */
export async function syncSchedules(queues: Runtime["queues"], schedules: Schedule[] = SCHEDULES): Promise<string[]> {
  for (const q of Object.values(queues)) {
    const wanted = new Set(schedules.filter((s) => queues[s.queue] === q).map((s) => s.id));
    for (const existing of await q.getJobSchedulers()) if (existing.key && !wanted.has(existing.key)) await q.removeJobScheduler(existing.key);
  }
  for (const s of schedules) {
    if (!s.jobs.length) continue;
    await queues[s.queue].upsertJobScheduler(s.id, { pattern: s.pattern, tz: "UTC" }, { name: s.id, data: { jobs: s.jobs, trigger: `schedule:${s.id}` } satisfies SequenceData, opts: { removeOnComplete: { count: 200 }, removeOnFail: { count: 500 } } });
  }
  return schedules.map((s) => s.id);
}

export async function startRuntime(opts: { connection: ConnectionOptions; schedules?: Schedule[]; run?: typeof runJob; startWorkers?: boolean } ): Promise<Runtime> {
  const bad = unknownJobs(opts.schedules);
  if (bad.length) throw new Error(`Schedules reference unknown jobs: ${bad.join(", ")}`);
  const queues = Object.fromEntries(QUEUES.map((name) => [name, new Queue<SequenceData>(name, { connection: opts.connection, prefix: QUEUE_PREFIX })])) as Runtime["queues"];
  await syncSchedules(queues, opts.schedules);
  const workers =
    opts.startWorkers === false
      ? []
      : QUEUES.map(
          (name) =>
            new Worker<SequenceData, SequenceResult>(name, (job) => processSequence(job, opts.run), {
              connection: opts.connection,
              prefix: QUEUE_PREFIX,
              concurrency: 1,
              // Long batch runs (daily ~minutes) must not be considered stalled.
              lockDuration: name === "batch" ? 10 * 60_000 : 2 * 60_000,
            }),
        );
  for (const w of workers) {
    w.on("failed", (job, err) => console.error(`[workers] ${w.name}/${job?.name ?? "?"} failed: ${err.message}`));
    w.on("completed", (job) => console.log(`[workers] ${w.name}/${job.name} done`));
  }
  return {
    queues,
    workers,
    close: async () => {
      await Promise.all(workers.map((w) => w.close()));
      await Promise.all(Object.values(queues).map((q) => q.close()));
    },
  };
}

/** One-off run outside the schedule (`pnpm --filter @founders/workers enqueue <job> [--opt=v]`). */
export async function enqueue(queue: Queue<SequenceData>, jobs: string[], options: SequenceData["options"] = {}) {
  const bad = jobs.filter((j) => !JOBS[j]);
  if (bad.length) throw new Error(`Unknown job(s): ${bad.join(", ")}`);
  return queue.add(`manual:${jobs.join("+")}`, { jobs, options, trigger: "manual" }, { removeOnComplete: { count: 200 }, removeOnFail: { count: 500 } });
}
