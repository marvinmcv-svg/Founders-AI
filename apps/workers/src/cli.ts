/**
 * `pnpm --filter @founders/workers enqueue <job|daily|weekly|monthly> [--key=value ...]`
 * `pnpm --filter @founders/workers enqueue schedules` lists what is scheduled.
 */
import "@founders/db/env";
import { Queue } from "bullmq";
import { enqueue, QUEUE_PREFIX, redisConnection, type SequenceData } from "./runtime";
import { SCHEDULES } from "./schedules";

const [name, ...rest] = process.argv.slice(2);
const options: Record<string, string | number | boolean> = {};
for (const a of rest) {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  if (!m?.[1]) continue;
  options[m[1]] = m[2] === undefined ? true : /^-?\d+(\.\d+)?$/.test(m[2]) ? Number(m[2]) : m[2];
}

if (!name || name === "schedules") {
  for (const s of SCHEDULES) console.log(`${s.id.padEnd(9)} ${s.queue.padEnd(8)} ${s.pattern.padEnd(12)} ${s.jobs.join(" → ")}`);
  process.exit(0);
}
const schedule = SCHEDULES.find((s) => s.id === name);
const jobs = schedule ? schedule.jobs : [name];
const queue = new Queue<SequenceData>(schedule?.queue ?? "batch", { connection: redisConnection(), prefix: QUEUE_PREFIX });
const job = await enqueue(queue, jobs, options);
console.log(`queued ${job.name} as ${job.id} on ${queue.name}`);
await queue.close();
