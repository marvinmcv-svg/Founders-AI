/**
 * Pipeline runner (plan 9.2). Every job run is logged in `pipeline_runs` with counts or the error.
 * Jobs are idempotent: re-running a job on the same input must not duplicate output.
 * Hosts: the CLI (`pnpm pipelines <job>`), the cron route in apps/app, and — once Redis exists
 * (H2) — BullMQ workers calling the same `runJob`.
 */
import { newId } from "@founders/core/ids";
import { pg } from "./db";

export type JobContext = {
  runId: string;
  trigger: string;
  options: Record<string, string | number | boolean>;
  log: (msg: string) => void;
  /** Increment a named counter reported in pipeline_runs.counts. */
  count: (name: string, by?: number) => void;
};

export type JobDef = {
  name: string;
  description: string;
  run: (ctx: JobContext) => Promise<void>;
};

export type RunResult = { runId: string; job: string; status: "SUCCEEDED" | "FAILED"; counts: Record<string, number>; error?: string; ms: number };

export async function runJob(
  job: JobDef,
  opts: { trigger?: string; options?: JobContext["options"]; quiet?: boolean } = {},
): Promise<RunResult> {
  const sql = pg();
  const runId = newId("run");
  const trigger = opts.trigger ?? "manual";
  const counts: Record<string, number> = {};
  const t0 = Date.now();
  await sql`INSERT INTO pipeline_runs (id, job, status, trigger) VALUES (${runId}, ${job.name}, 'RUNNING', ${trigger})`;
  const ctx: JobContext = {
    runId,
    trigger,
    options: opts.options ?? {},
    log: (m) => {
      if (!opts.quiet) console.log(`[${job.name}] ${m}`);
    },
    count: (name, by = 1) => {
      counts[name] = (counts[name] ?? 0) + by;
    },
  };
  try {
    await job.run(ctx);
    await sql`UPDATE pipeline_runs SET status = 'SUCCEEDED', counts = ${sql.json(counts)}, finished_at = now() WHERE id = ${runId}`;
    return { runId, job: job.name, status: "SUCCEEDED", counts, ms: Date.now() - t0 };
  } catch (err) {
    const message = err instanceof Error ? `${err.message}\n${err.stack ?? ""}`.slice(0, 4000) : String(err);
    await sql`UPDATE pipeline_runs SET status = 'FAILED', counts = ${sql.json(counts)}, error = ${message}, finished_at = now() WHERE id = ${runId}`;
    return { runId, job: job.name, status: "FAILED", counts, error: message, ms: Date.now() - t0 };
  }
}

export async function recentRuns(limit = 30) {
  const sql = pg();
  return sql<{ id: string; job: string; status: string; trigger: string; counts: Record<string, number> | null; error: string | null; started_at: Date; finished_at: Date | null }[]>`
    SELECT id, job, status, trigger, counts, error, started_at, finished_at FROM pipeline_runs ORDER BY started_at DESC LIMIT ${limit}`;
}
