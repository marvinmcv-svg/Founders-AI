#!/usr/bin/env node
/**
 * Security checks for CI and release (plan 14.4: dependency scanning, secret scanning, NEXT_PUBLIC_ audit).
 *   node scripts/security-audit.mjs            # all checks; exit 1 on a finding not in the accepted list
 * 1. `pnpm audit --prod`: high/critical advisories must be fixed or listed in ACCEPTED with a reason.
 * 2. Secrets in tracked files: common key formats (Stripe, Anthropic, AWS, GitHub, private keys, our own key prefixes).
 * 3. NEXT_PUBLIC_ variables: only the allow-listed public ones may exist (anything else would ship to browsers).
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** Triaged advisories (docs/security/dependency-audit.md). Remove an entry once the upstream fix lands. */
const ACCEPTED = {
  tinypool: "test runner reached only through better-auth's optional vitest peer; never loaded at runtime",
  vitest: "same: dev/test only",
  "@vitest/mocker": "same: dev/test only",
  postcss: "build-time CSS processing inside next; input is our own CSS",
  sharp: "next/image is not used (no runtime image optimisation)",
  esbuild: "drizzle-kit dev CLI only",
};
const PUBLIC_ENV = new Set(["NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_WWW_URL", "NEXT_PUBLIC_TURNSTILE_SITE_KEY", "NEXT_PUBLIC_POSTHOG_KEY", "NEXT_PUBLIC_POSTHOG_HOST", "NEXT_PUBLIC_CALCOM_LINK"]);

let failed = false;
const out = (ok, msg) => {
  console.log(`${ok ? "✓" : "✗"} ${msg}`);
  if (!ok) failed = true;
};

// 1. Dependencies
try {
  const raw = execSync("pnpm audit --prod --json", { stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 }).toString();
  report(raw);
} catch (e) {
  report(e.stdout?.toString() ?? "{}"); // pnpm audit exits non-zero when it finds anything
}
function report(raw) {
  const adv = Object.values(JSON.parse(raw || "{}").advisories ?? {});
  const serious = adv.filter((a) => a.severity === "high" || a.severity === "critical");
  const open = serious.filter((a) => !ACCEPTED[a.module_name]);
  for (const a of serious) console.log(`  ${a.severity.padEnd(8)} ${a.module_name} ${a.vulnerable_versions} ${ACCEPTED[a.module_name] ? `(accepted: ${ACCEPTED[a.module_name]})` : "(OPEN)"}`);
  out(open.length === 0, `dependency audit: ${serious.length} high/critical, ${open.length} not triaged`);
}

// 2. Secrets in tracked files
const PATTERNS = [
  ["Stripe live key", /\b(sk|rk)_live_[0-9A-Za-z]{16,}/],
  ["Stripe webhook secret", /\bwhsec_[0-9A-Za-z]{24,}/],
  ["Anthropic key", /\bsk-ant-[0-9A-Za-z_-]{20,}/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["GitHub token", /\bgh[pousr]_[0-9A-Za-z]{30,}/],
  ["Private key", /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----\s*[A-Za-z0-9+/=]{40,}/],
  ["Founders API key", /\bfai_(?!demo_local_only_)[0-9A-Za-z_-]{30,}/],
  ["SCIM token", /\bscim_[0-9A-Za-z_-]{30,}/],
];
const files = execSync("git ls-files", { maxBuffer: 64 * 1024 * 1024 }).toString().split("\n").filter((f) => f && !/\.(png|jpg|jpeg|gif|webp|ico|woff2?|ttf|parquet|lock|dump)$/.test(f) && !f.includes("pnpm-lock"));
const hits = [];
for (const f of files) {
  let text;
  try {
    text = readFileSync(f, "utf8");
  } catch {
    continue;
  }
  for (const [name, re] of PATTERNS) if (re.test(text)) hits.push(`${f}: ${name}`);
}
for (const h of hits) console.log(`  ${h}`);
out(hits.length === 0, `secret scan: ${files.length} tracked files, ${hits.length} finding(s)`);

// 3. NEXT_PUBLIC_ audit
const used = new Set(execSync("git grep -ohE 'NEXT_PUBLIC_[A-Z0-9_]+' -- apps packages .env.example || true").toString().split("\n").filter(Boolean));
const extra = [...used].filter((v) => !PUBLIC_ENV.has(v));
out(extra.length === 0, `NEXT_PUBLIC_ audit: ${[...used].join(", ") || "none"}${extra.length ? ` — not allow-listed: ${extra.join(", ")}` : ""}`);

process.exitCode = failed ? 1 : 0;
