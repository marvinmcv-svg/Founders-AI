"use client";
/**
 * Minimal, safe markdown for agent answers: headings, lists, tables, code, bold/italic, links and
 * `[[id]]` source chips. Builds React elements only (no HTML injection), so tool or model text can
 * never execute in the page.
 */
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import type { AgentSource } from "@founders/core/repo";

export type SourceMap = Record<string, AgentSource>;

const HREF: Record<string, string> = { com: "/companies/", per: "/people/", inv: "/investors/", lst: "/lists/", srh: "/searches/" };

export function sourceHref(id: string, src?: AgentSource): string | null {
  if (src?.kind === "web" && src.url && /^https:\/\//.test(src.url)) return src.url;
  if (/^https:\/\//.test(id)) return id;
  const base = HREF[id.slice(0, 3)];
  return base ? `${base}${id}` : null;
}

export function SourceChip({ id, sources, compact }: { id: string; sources: SourceMap; compact?: boolean }) {
  const src = sources[id];
  const href = sourceHref(id, src);
  const KIND_LABEL: Record<string, string> = { com: "company", per: "person", inv: "investor", trx: "round", sig: "signal", nsg: "news", lst: "list", srh: "search" };
  const label = src?.label ?? KIND_LABEL[id.slice(0, 3)] ?? "source";
  const cls = compact
    ? "ml-0.5 inline-flex items-center align-super text-[10px] leading-none text-faint hover:text-accent"
    : "mx-0.5 inline-flex max-w-[180px] items-center truncate rounded border border-line bg-white/[0.04] px-1 align-[1px] text-[10.5px] leading-[16px] text-muted hover:border-accent/50 hover:text-accent";
  const body = compact ? "↗" : label;
  const aria = compact ? `Source: ${label}` : undefined;
  if (!href) return <span className={cls} title={label} aria-label={aria}>{body}</span>;
  if (href.startsWith("http")) return <a href={href} target="_blank" rel="noopener noreferrer nofollow" className={cls} title={label} aria-label={aria}>{body}</a>;
  return <Link href={href} className={cls} title={label} aria-label={aria}>{body}</Link>;
}

function inline(text: string, sources: SourceMap, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  // Italic `_x_` only at word boundaries, so snake_case values and ids stay intact.
  const re = /(\[\[[^\]]+\]\]|\*\*[^*]+\*\*|`[^`]+`|(?<![\w\]])_[^_\s](?:[^_]*[^_\s])?_(?![\w[])|\[[^\]]+\]\((?:https:\/\/|\/)[^)\s]+\))/g;
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${keyBase}-${n++}`;
    if (t.startsWith("[[")) {
      // A chip right after the same name ("**Acme** [[com_…]]") collapses to an icon link.
      const id = t.slice(2, -2);
      const before = text.slice(0, m.index).replace(/\*\*/g, "").trimEnd();
      const label = sources[id]?.label;
      out.push(<SourceChip key={k} id={id} sources={sources} compact={Boolean(label && before.endsWith(label))} />);
    }
    else if (t.startsWith("**")) out.push(<strong key={k} className="font-semibold text-ink">{inline(t.slice(2, -2), sources, k)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={k} className="rounded bg-white/[0.06] px-1 text-[12px]">{t.slice(1, -1)}</code>);
    else if (t.startsWith("_")) out.push(<em key={k} className="text-muted">{t.slice(1, -1)}</em>);
    else {
      const mm = t.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (mm) {
        const href = mm[2]!;
        out.push(href.startsWith("/") ? <Link key={k} href={href} className="text-accent hover:underline">{mm[1]}</Link> : <a key={k} href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-accent hover:underline">{mm[1]}</a>);
      }
    }
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text, sources }: { text: string; sources: SourceMap }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const k = `b${key++}`;
    if (line.startsWith("```")) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith("```")) body.push(lines[i++]!);
      i++;
      blocks.push(<pre key={k} className="my-2 overflow-x-auto whitespace-pre-wrap rounded-lg border border-line bg-sunken p-3 text-[12.5px] text-ink">{body.join("\n")}</pre>);
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = h[1]!.length;
      const cls = level <= 2 ? "mt-4 mb-1.5 text-[16px] font-semibold text-ink" : "mt-3 mb-1 text-[14px] font-semibold text-ink";
      blocks.push(<div key={k} role="heading" aria-level={level} className={cls}>{inline(h[2]!, sources, k)}</div>);
      i++;
      continue;
    }
    if (line.trim().startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.trim().startsWith("|")) {
        const cells = lines[i]!.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      blocks.push(
        <div key={k} className="my-2 overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-[12.5px]">
            {head ? <thead><tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-faint">{head.map((c, j) => <th key={j} className="px-3 py-2 font-medium">{inline(c, sources, `${k}h${j}`)}</th>)}</tr></thead> : null}
            <tbody>{body.map((r, ri) => <tr key={ri} className="border-b border-line/50 last:border-0">{r.map((c, j) => <td key={j} className="px-3 py-1.5 align-top">{inline(c, sources, `${k}r${ri}c${j}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\s*([-*]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+[.)])\s+/.test(lines[i]!)) items.push(lines[i++]!.replace(/^\s*([-*]|\d+[.)])\s+/, ""));
      const Tag = ordered ? "ol" : "ul";
      blocks.push(<Tag key={k} className={`my-1.5 flex flex-col gap-1 pl-5 ${ordered ? "list-decimal" : "list-disc"} marker:text-faint`}>{items.map((it, j) => <li key={j}>{inline(it, sources, `${k}i${j}`)}</li>)}</Tag>);
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^(#{1,4}\s|```|\s*\||\s*([-*]|\d+[.)])\s)/.test(lines[i]!)) para.push(lines[i++]!);
    blocks.push(<p key={k} className="my-1.5">{para.map((p, j) => <Fragment key={j}>{j ? <br /> : null}{inline(p, sources, `${k}p${j}`)}</Fragment>)}</p>);
  }
  return <div className="text-[13.5px] leading-relaxed text-ink/90">{blocks}</div>;
}
