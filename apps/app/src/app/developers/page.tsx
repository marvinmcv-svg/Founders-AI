import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@founders/config";
import { ENDPOINTS } from "@founders/api";
import { API_BULK_MAX, API_MAX_PAGE_SIZE, API_RATE_LIMIT_RPS, API_TRIAL_CREDITS } from "@founders/core/limits";
import { CREDIT_PRICES } from "@founders/core/pricing";
import { Card, Wordmark } from "@founders/ui";
import { CodeBlock, EndpointPill } from "@founders/ui/code";

export const metadata: Metadata = { title: "API reference", description: `${brand.name} REST API reference` };

/** Public API docs (R1 stand-in for the Fumadocs site — see docs/decisions.md). */
export default function Developers() {
  const base = `${brand.urls.app}/api/v1`;
  const tags = [...new Set(ENDPOINTS.map((e) => e.tag))];
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Link href="/companies"><Wordmark /></Link>
      <h1 className="mt-8 text-[36px] font-semibold">API reference</h1>
      <p className="mt-2 max-w-2xl text-[15px] text-muted">
        {ENDPOINTS.length} endpoints behind one key. Base URL <code className="text-accent">{base}</code>. Auth with the <code>X-API-Key</code> header. JSON, cursor pagination, RFC 7807 errors.
      </p>
      <div className="mt-4 flex flex-wrap gap-2 text-[13px]">
        <a className="rounded-full border border-line px-3 py-1 hover:border-accent/50" href="/api/v1/openapi.json">openapi.json</a>
        <a className="rounded-full border border-line px-3 py-1 hover:border-accent/50" href="/api/v1/llms.txt">llms.txt</a>
        <Link className="rounded-full border border-line px-3 py-1 hover:border-accent/50" href="/settings#api">Request a key</Link>
      </div>
      <div className="mt-8 grid gap-3 md:grid-cols-4">
        {[[`${API_RATE_LIMIT_RPS} req/s`, "per key"], [API_MAX_PAGE_SIZE.toLocaleString(), "records per page"], [String(API_BULK_MAX), "lookups per bulk call"], [String(API_TRIAL_CREDITS), "trial credits"]].map(([v, l]) => (
          <Card key={l} className="p-4"><p className="font-display text-[22px] text-ink">{v}</p><p className="text-[12px] text-muted">{l}</p></Card>
        ))}
      </div>
      <h2 className="mt-10 text-[20px] font-semibold">Quickstart</h2>
      <CodeBlock className="mt-3" tabs={[
        { label: "cURL", code: `curl -X POST "${base}/companies/resolve" \\\n  -H "X-API-Key: $FOUNDERS_API_KEY" -H "Content-Type: application/json" \\\n  -d '{"items":[{"domain":"example.com"}]}'\n\ncurl -H "X-API-Key: $FOUNDERS_API_KEY" "${base}/companies/{companyId}"`, lang: "bash" },
        { label: "Python", code: `import os, requests\nH = {"X-API-Key": os.environ["FOUNDERS_API_KEY"]}\nr = requests.post("${base}/search", json={"query": "seed fintech in Bolivia"}, headers=H)\nprint(r.headers["X-Credits-Remaining"], r.json()["items"][:3])`, lang: "python" },
        { label: "JavaScript", code: `const r = await fetch("${base}/funding-rounds?announced_date_after=2026-01-01&limit=100", {\n  headers: { "X-API-Key": process.env.FOUNDERS_API_KEY },\n});\nconst { items, next_cursor } = await r.json();`, lang: "js" },
      ]} />
      <h2 className="mt-10 text-[20px] font-semibold">Credits</h2>
      <p className="mt-2 text-[14px] text-muted">
        By-ID and enrichment: {CREDIT_PRICES["entity.by_id"]} per matched record · estimates: {CREDIT_PRICES["estimates.record"]} · verified email: {CREDIT_PRICES["person.email"]} when found · feeds &amp; searches: {CREDIT_PRICES["feed.per_100"]} per 100 records · AI search: {CREDIT_PRICES["ai_search.query"]} + page · resolve, lists and saved-search management: free. Misses are never charged. Every response returns <code>X-Credits-Charged</code> and <code>X-Credits-Remaining</code>.
      </p>
      {tags.map((tag) => (
        <section key={tag} className="mt-10">
          <h2 className="text-[20px] font-semibold">{tag}</h2>
          <Card className="mt-3 divide-y divide-line">
            {ENDPOINTS.filter((e) => e.tag === tag).map((e) => (
              <div key={e.method + e.path} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <EndpointPill method={e.method.toUpperCase()} path={e.path.replace(/:(\w+)/g, "{$1}")} />
                <span className="text-[13px] text-text">{e.summary}</span>
                <span className="ml-auto text-[12px] text-muted">{e.credit.replace(/_/g, " ")}</span>
              </div>
            ))}
          </Card>
        </section>
      ))}
    </div>
  );
}
