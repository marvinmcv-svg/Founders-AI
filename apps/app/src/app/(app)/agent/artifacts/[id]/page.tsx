import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import * as repo from "@founders/core/repo";
import { Card, LineChart } from "@founders/ui";
import { Markdown, type SourceMap } from "@/components/agent/Markdown";
import { ArtifactActions } from "@/components/agent/ArtifactActions";
import { getCtx } from "@/lib/session";

export const metadata: Metadata = { title: "Artifact" };

type Chart = { title: string; kind: "bar" | "line"; labels: string[]; series: { name: string; values: number[] }[]; unit?: string };

function Bars({ c }: { c: Chart }) {
  const s = c.series[0];
  if (!s) return null;
  const max = Math.max(...s.values.map(Math.abs), 1);
  return (
    <div className="flex flex-col gap-1.5" role="list" aria-label={c.title}>
      {c.labels.map((l, i) => (
        <div key={i} role="listitem" className="grid grid-cols-[180px_1fr_90px] items-center gap-3 text-[12.5px]">
          <span className="truncate text-muted">{l}</span>
          <span className="h-3 rounded-sm bg-accent/80" style={{ width: `${(Math.abs(s.values[i] ?? 0) / max) * 100}%` }} />
          <span className="text-right text-ink">{(s.values[i] ?? 0).toLocaleString("en-US")}{c.unit ?? ""}</span>
        </div>
      ))}
    </div>
  );
}

export default async function Artifact({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx();
  const { id } = await params;
  let a: Awaited<ReturnType<typeof repo.getArtifact>>;
  try {
    a = await repo.getArtifact(ctx, id);
  } catch (e) {
    if (e instanceof repo.NotFoundError) notFound();
    throw e;
  }
  const sources: SourceMap = {};
  if (a.thread_id) {
    try {
      for (const m of await repo.getMessages(ctx, a.thread_id)) for (const s of m.sources ?? []) sources[s.id] = s;
    } catch {
      /* thread deleted or private: chips fall back to ids */
    }
  }
  const content = (a.content ?? {}) as Record<string, unknown>;
  const text = a.kind === "memo" ? String(content.markdown ?? "") : a.kind === "email" ? `Subject: ${String(content.subject ?? "")}\n\n${String(content.body ?? "")}` : a.kind === "csv" ? String(content.csv ?? "") : "";
  return (
    <div className="mx-auto max-w-[860px] p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-faint">{a.kind} · {new Date(a.created_at).toLocaleString()}</p>
          <h1 className="text-[20px] font-semibold text-ink">{a.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          {a.thread_id ? <Link href={`/agent/${a.thread_id}`} className="text-[12.5px] text-muted hover:text-ink">Back to thread</Link> : null}
          <ArtifactActions kind={a.kind} title={a.title} text={text} />
        </div>
      </div>
      <Card className="p-5">
        {a.kind === "memo" ? <Markdown text={text} sources={sources} /> : null}
        {a.kind === "email" ? <pre className="whitespace-pre-wrap text-[13.5px] text-ink">{text}</pre> : null}
        {a.kind === "csv" ? <pre className="max-h-[60vh] overflow-auto whitespace-pre text-[12px] text-ink">{text}</pre> : null}
        {a.kind === "chart" ? (() => {
          const c = content as unknown as Chart;
          return c.kind === "line" ? <LineChart labels={c.labels} series={c.series} height={240} /> : <Bars c={c} />;
        })() : null}
      </Card>
      {a.kind === "email" ? <p className="mt-2 text-[12px] text-faint">Draft only — nothing was sent.</p> : null}
    </div>
  );
}
