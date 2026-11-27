/** BullMQ workers (D-076): schedule coverage, sequence semantics, and a live run on Redis + Postgres. */
import { afterAll, describe, expect, it } from "vitest";
import { DAILY, DAILY_WORKER, MINUTELY_WORKER, MONTHLY, WEEKLY, type JobDef, type RunResult } from "@founders/pipelines";
import { getSql } from "@founders/db";
import { Queue } from "bullmq";
import { enqueue, processSequence, QUEUE_PREFIX, redisConnection, startRuntime, syncSchedules, type Runtime } from "../src/runtime";
import { SCHEDULES, unknownJobs } from "../src/schedules";

describe("schedules", () => {
  it("cover every registry job list exactly once, with real job names", () => {
    expect(unknownJobs()).toEqual([]);
    const scheduled = SCHEDULES.flatMap((s) => s.jobs);
    for (const j of new Set([...DAILY, ...DAILY_WORKER, ...MINUTELY_WORKER, ...WEEKLY, ...MONTHLY])) expect(scheduled.filter((x) => x === j)).toHaveLength(1);
    expect(SCHEDULES.find((s) => s.id === "minutely")).toMatchObject({ queue: "realtime", jobs: ["search-index"] });
    expect(SCHEDULES.find((s) => s.id === "daily")!.jobs).toContain("sec-formd");
  });
});

describe("processSequence", () => {
  const fakeRun = (failing: string[]) => async (def: JobDef): Promise<RunResult> => ({ runId: "run_x", job: def.name, status: failing.includes(def.name) ? "FAILED" : "SUCCEEDED", counts: {}, ms: 1 });
  const job = (jobs: string[]) => ({ data: { jobs }, progress: [] as number[], updateProgress(p: number) { this.progress.push(p); return Promise.resolve(); } });

  it("runs every job in order and reports progress", async () => {
    const j = job(["highlights", "alerts"]);
    const r = await processSequence(j as never, fakeRun([]) as never);
    expect(r.results.map((x) => x.job)).toEqual(["highlights", "alerts"]);
    expect(j.progress).toEqual([50, 100]);
  });

  it("keeps going after a failure, then fails the BullMQ job naming what failed", async () => {
    const seen: string[] = [];
    const run = async (def: JobDef) => (seen.push(def.name), fakeRun(["highlights"])(def));
    await expect(processSequence(job(["highlights", "alerts", "nope"]) as never, run as never)).rejects.toThrow(/Failed: highlights, nope/);
    expect(seen).toEqual(["highlights", "alerts"]);
  });
});

/* ---------------- live: Redis + Postgres ---------------- */

let redisUp = false;
let rt: Runtime | null = null;
try {
  const probe = new Queue("probe", { connection: redisConnection(), prefix: QUEUE_PREFIX });
  await Promise.race([probe.getJobCounts(), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 2000))]);
  await probe.obliterate({ force: true });
  await probe.close();
  redisUp = true;
} catch {
  /* no Redis: live tests skip */
}

afterAll(async () => {
  if (rt) {
    for (const q of Object.values(rt.queues)) await q.obliterate({ force: true }).catch(() => undefined);
    await rt.close();
  }
  await getSql().end({ timeout: 1 });
});

describe.skipIf(!redisUp)("live runtime", () => {
  it("upserts the schedulers idempotently and removes ones no longer defined", async () => {
    rt = await startRuntime({ connection: redisConnection(), startWorkers: false });
    const keys = async () => (await Promise.all(Object.values(rt!.queues).map((q) => q.getJobSchedulers()))).flat().map((s) => s.key).sort();
    expect(await keys()).toEqual(["daily", "minutely", "monthly", "weekly"]);
    await rt.queues.batch.upsertJobScheduler("retired", { pattern: "0 0 * * *" }, { name: "retired", data: { jobs: ["highlights"] } });
    await syncSchedules(rt.queues);
    expect(await keys()).toEqual(["daily", "minutely", "monthly", "weekly"]);
    await rt.close();
    rt = null;
  });

  it("a queued job runs through runJob and lands in pipeline_runs", async () => {
    rt = await startRuntime({ connection: redisConnection() });
    await expect(enqueue(rt.queues.batch, ["no-such-job"])).rejects.toThrow(/Unknown job/);
    const since = new Date();
    const job = await enqueue(rt.queues.batch, ["privacy-sla"]);
    const done = await new Promise<string>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("job did not finish")), 25_000);
      const poll = setInterval(async () => {
        const state = await job.getState();
        if (state === "completed" || state === "failed") {
          clearInterval(poll);
          clearTimeout(t);
          resolve(state);
        }
      }, 200);
    });
    expect(done).toBe("completed");
    const [run] = (await getSql()`SELECT job, status, trigger FROM pipeline_runs WHERE job = 'privacy-sla' AND started_at >= ${since.toISOString()} ORDER BY started_at DESC LIMIT 1`) as unknown as { job: string; status: string; trigger: string }[];
    expect(run).toEqual({ job: "privacy-sla", status: "SUCCEEDED", trigger: "manual" });
  });
});
