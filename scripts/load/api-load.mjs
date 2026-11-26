#!/usr/bin/env node
/**
 * API load test (plan 15 Phase 10: "load test API 15 rps × 200 keys").
 *
 *   node scripts/load/api-load.mjs --base http://localhost:3001/api/v1 --keys 200 --rps-per-key 0.075 --duration 60
 *
 * 1. Setup: a throwaway workspace with N API keys (inserted directly, hashed like real keys) and credits.
 * 2. Open-loop load: requests are fired at a fixed arrival rate (keys × rps-per-key), round-robin over
 *    keys, over a read-heavy endpoint mix; latency is measured per request.
 * 3. Rate-limit check: one key is driven at 2× the per-key limit; ~half must be 429 with Retry-After.
 * 4. Report (Markdown) to stdout and --out; teardown removes the workspace and keys.
 *
 * Needs DATABASE_URL (setup/teardown) and a running app or API server at --base.
 * The default 15 rps total over 200 keys is the plan's interactive target; --rps-per-key 15 drives every key at its limit (3,000 rps).
 */
import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import postgres from "postgres";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] === undefined ? "true" : all[i + 1]]] : acc), []),
);
const BASE = (args.base ?? "http://localhost:3001/api/v1").replace(/\/$/, "");
const KEYS = Number(args.keys ?? 200);
const RPS_PER_KEY = Number(args["rps-per-key"] ?? 15 / 200);
const DURATION_S = Number(args.duration ?? 60);
const LIMIT = 15; // core/limits.ts API_RATE_LIMIT_RPS
const ORG = "org_loadtest00000000000000001";
const USER = "usr_demo000000000000000000001";
const sql = postgres(process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/founders", { max: 4, onnotice: () => {} });
const sha = (s) => createHash("sha256").update(s).digest("hex");

async function setup() {
  await teardown();
  await sql`INSERT INTO organization (id, name, slug, seats, plan) VALUES (${ORG}, 'Load test', 'load-test', 5, 'platform')`;
  await sql`INSERT INTO credit_balances (org_id, balance) VALUES (${ORG}, 100000000)`;
  const keys = Array.from({ length: KEYS }, (_, i) => `fai_load${i}_${randomBytes(12).toString("base64url")}`);
  const rows = keys.map((k, i) => ({ id: `key_load${String(i).padStart(20, "0")}`, org_id: ORG, user_id: USER, name: `load ${i}`, prefix: k.slice(0, 10), hash: sha(k), scopes: "{read:data,write:lists,write:searches}", status: "ACTIVE" }));
  await sql`INSERT INTO api_keys ${sql(rows, "id", "org_id", "user_id", "name", "prefix", "hash", "scopes", "status")}`;
  const companies = (await sql`SELECT id FROM companies WHERE deleted_at IS NULL ORDER BY rank LIMIT 200`).map((r) => r.id);
  const people = (await sql`SELECT id FROM people WHERE deleted_at IS NULL ORDER BY id LIMIT 200`).map((r) => r.id);
  return { keys, companies, people };
}

async function teardown() {
  await sql`DELETE FROM api_keys WHERE org_id = ${ORG}`;
  await sql`DELETE FROM credit_ledger WHERE org_id = ${ORG}`;
  await sql`DELETE FROM usage_events WHERE org_id = ${ORG}`;
  await sql`DELETE FROM credit_balances WHERE org_id = ${ORG}`;
  await sql`DELETE FROM search_reads WHERE org_id = ${ORG}`.catch(() => {});
  await sql`DELETE FROM organization WHERE id = ${ORG}`;
}

const pick = (a) => a[Math.floor(Math.random() * a.length)];
function request(i, data) {
  const r = Math.random();
  if (r < 0.4) return { name: "GET /companies/:id", path: `/companies/${pick(data.companies)}` };
  if (r < 0.6) return { name: "GET /people/:id", path: `/people/${pick(data.people)}` };
  if (r < 0.75) return { name: "GET /news-signals", path: "/news-signals?limit=25" };
  if (r < 0.85) return { name: "GET /companies/:id/traction", path: `/companies/${pick(data.companies)}/traction` };
  if (r < 0.95) return { name: "POST /companies/resolve", path: "/companies/resolve", body: { items: [{ domain: "example.com" }, { name: "Acme" }] } };
  return { name: "GET /organization/credits", path: "/organization/credits" };
}

const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0);

async function fire(key, req) {
  const t0 = performance.now();
  try {
    const res = await fetch(`${BASE}${req.path}`, {
      method: req.body ? "POST" : "GET",
      headers: { "x-api-key": key, ...(req.body ? { "content-type": "application/json" } : {}) },
      body: req.body ? JSON.stringify(req.body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    await res.arrayBuffer();
    return { ms: performance.now() - t0, status: res.status, retryAfter: res.headers.get("retry-after") };
  } catch (e) {
    return { ms: performance.now() - t0, status: 0, error: String(e?.name ?? e) };
  }
}

async function openLoop(data, rps, seconds, keyFor) {
  const results = [];
  const inflight = [];
  const start = performance.now();
  let sent = 0;
  await new Promise((resolve) => {
    const tick = setInterval(() => {
      const elapsed = (performance.now() - start) / 1000;
      if (elapsed >= seconds) {
        clearInterval(tick);
        return resolve();
      }
      const due = Math.floor(elapsed * rps) - sent;
      for (let j = 0; j < due; j++) {
        const i = sent++;
        const req = request(i, data);
        inflight.push(fire(keyFor(i), req).then((r) => results.push({ ...r, name: req.name })));
      }
    }, 5);
  });
  await Promise.all(inflight);
  return { results, wall: (performance.now() - start) / 1000 };
}

function summarize(results, wall) {
  const ok = results.filter((r) => r.status >= 200 && r.status < 300);
  const lat = ok.map((r) => r.ms).sort((a, b) => a - b);
  const by = {};
  for (const r of results) {
    const b = (by[r.name] ??= { n: 0, ok: 0, lat: [] });
    b.n++;
    if (r.status >= 200 && r.status < 300) {
      b.ok++;
      b.lat.push(r.ms);
    }
  }
  const statuses = {};
  for (const r of results) statuses[r.status] = (statuses[r.status] ?? 0) + 1;
  return {
    requests: results.length,
    achievedRps: results.length / wall,
    okRate: ok.length / Math.max(1, results.length),
    errors5xx: results.filter((r) => r.status >= 500).length,
    network: results.filter((r) => r.status === 0).length,
    p50: pct(lat, 50), p95: pct(lat, 95), p99: pct(lat, 99), max: lat.at(-1) ?? 0,
    statuses,
    endpoints: Object.entries(by).map(([name, b]) => ({ name, n: b.n, ok: b.ok, p95: pct(b.lat.sort((x, y) => x - y), 95) })),
  };
}

const f = (n) => (typeof n === "number" ? (n >= 100 ? n.toFixed(0) : n.toFixed(1)) : String(n));

const data = await setup();
console.error(`setup: ${KEYS} keys, ${data.companies.length} companies, ${data.people.length} people; ${KEYS * RPS_PER_KEY} rps for ${DURATION_S}s → ${BASE}`);
try {
  // Warm-up (JIT, connection pool, Next route compilation in dev).
  await openLoop(data, 5, 5, (i) => data.keys[i % KEYS]);
  const load = await openLoop(data, KEYS * RPS_PER_KEY, DURATION_S, (i) => data.keys[i % KEYS]);
  const s = summarize(load.results, load.wall);
  // Rate limiter: one key at 2× the limit for 5 s.
  await new Promise((r) => setTimeout(r, 1500));
  const rl = await openLoop(data, LIMIT * 2, 5, () => data.keys[0]);
  const limited = rl.results.filter((r) => r.status === 429);
  const accepted = rl.results.filter((r) => r.status >= 200 && r.status < 300).length;
  const report = `## API load test — ${new Date().toISOString()}

Target: \`${BASE}\` · ${KEYS} keys × ${RPS_PER_KEY} rps/key = **${f(KEYS * RPS_PER_KEY)} rps** for ${DURATION_S} s (open loop, read-heavy mix).

| Metric | Value |
|---|---|
| Requests | ${s.requests} |
| Achieved rate | ${f(s.achievedRps)} rps |
| Success (2xx) | ${(s.okRate * 100).toFixed(2)} % |
| 5xx / network errors | ${s.errors5xx} / ${s.network} |
| Latency p50 / p95 / p99 / max | ${f(s.p50)} / ${f(s.p95)} / ${f(s.p99)} / ${f(s.max)} ms |
| Status codes | ${Object.entries(s.statuses).map(([k, v]) => `${k}: ${v}`).join(", ")} |

| Endpoint | Requests | 2xx | p95 ms |
|---|---|---|---|
${s.endpoints.map((e) => `| ${e.name} | ${e.n} | ${e.ok} | ${f(e.p95)} |`).join("\n")}

**Rate limiter** (one key at ${LIMIT * 2} rps for 5 s, limit ${LIMIT} rps): ${accepted} accepted (≈ ${f(accepted / 5)} rps), ${limited.length} answered 429${limited.every((r) => r.retryAfter) ? " with Retry-After" : " (some without Retry-After!)"}.
`;
  console.log(report);
  if (args.out) writeFileSync(args.out, report);
  const pass = s.okRate >= 0.99 && s.errors5xx === 0 && limited.length > 0 && accepted / 5 <= LIMIT * 1.4;
  console.error(pass ? "PASS" : "FAIL");
  process.exitCode = pass ? 0 : 1;
} finally {
  await teardown();
  await sql.end();
}
