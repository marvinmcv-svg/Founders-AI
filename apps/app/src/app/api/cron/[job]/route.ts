import { timingSafeEqual } from "node:crypto";
import { JOBS, runJob } from "@founders/pipelines";

/**
 * Scheduled pipeline runs (D-023). Vercel Cron calls GET with `Authorization: Bearer $CRON_SECRET`.
 * Only jobs that fit a serverless time budget run here; the weekly competitors and monthly traction /
 * ML jobs run on a worker host (H2) or from the CLI.
 *   /api/cron/daily    talent → news → highlights → alerts → webhooks → digests → agent-schedules → interest (flag) → crm-sync → network (digests and schedules: everything due today)
 *   /api/cron/alerts   real-time alert sweep (point an external scheduler here for sub-daily cadence)
 *   /api/cron/webhooks customer webhook deliveries and retries (same: sub-hourly scheduler recommended)
 */
export const runtime = "nodejs";
export const maxDuration = 300;

const SERVERLESS_JOBS = ["talent", "news", "highlights", "alerts", "webhooks", "digests", "agent-schedules", "interest", "crm-sync", "network"];

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || secret.length < 16) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request, { params }: { params: Promise<{ job: string }> }) {
  if (!authorized(req)) return new Response("Not found", { status: 404 });
  const { job } = await params;
  const names = job === "daily" ? SERVERLESS_JOBS : SERVERLESS_JOBS.includes(job) ? [job] : [];
  if (!names.length) return Response.json({ error: `Unknown or non-serverless job: ${job}` }, { status: 400 });
  const results = [];
  for (const n of names) {
    const def = JOBS[n];
    if (!def) continue;
    // A daily cron sends every digest that is due today, whatever the hour.
    results.push(await runJob(def, { trigger: "cron", options: n === "digests" || n === "agent-schedules" ? { anyHour: true } : {}, quiet: true }));
  }
  const failed = results.some((r) => r.status === "FAILED");
  return Response.json({ ok: !failed, results: results.map(({ error, ...r }) => ({ ...r, error: error?.split("\n")[0] })) }, { status: failed ? 500 : 200 });
}
