/**
 * Worker host entry (Docker image on Railway/Fly, H2): `pnpm --filter @founders/workers start`.
 * Needs REDIS_URL and DATABASE_URL. GET /health on PORT (default 8080) for the platform's probe.
 */
import "@founders/db/env";
import { createServer } from "node:http";
import { closeAll } from "@founders/db";
import { redisConnection, startRuntime } from "./runtime";
import { SCHEDULES } from "./schedules";

const rt = await startRuntime({ connection: redisConnection() });
console.log(`[workers] schedules: ${SCHEDULES.map((s) => `${s.id} (${s.pattern}: ${s.jobs.join(", ") || "—"})`).join(" · ")}`);

const server = createServer(async (req, res) => {
  if (req.url !== "/health") {
    res.writeHead(404).end();
    return;
  }
  try {
    const client = await rt.queues.realtime.client;
    if (client.status !== "ready") throw new Error(`redis ${client.status}`);
    const counts = await rt.queues.batch.getJobCounts("active", "waiting", "failed"); // a Redis round trip
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true, workers: rt.workers.map((w) => ({ queue: w.name, running: w.isRunning() })), batch: counts }));
  } catch (e) {
    res.writeHead(503, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
  }
});
server.listen(Number(process.env.PORT ?? 8080));

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`[workers] ${signal}: finishing current jobs…`);
  server.close();
  await rt.close(); // waits for running jobs to finish
  await closeAll();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
