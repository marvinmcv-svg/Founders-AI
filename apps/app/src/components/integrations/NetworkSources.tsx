"use client";
/**
 * Per-user network sources (plan 13.2): LinkedIn data-export upload with match rate, mailbox and
 * calendar connections (demo until Google/Microsoft verification, H10), removal. Opt-in per user;
 * only who-knows-whom edges are stored, never message content.
 */
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Loader2, Upload } from "lucide-react";
import { Badge, buttonClass, Card } from "@founders/ui";
import { networkConnectDemo, networkImportLinkedin, networkRemoveSource } from "@/app/integration-actions";

type Provider = "LINKEDIN_CSV" | "GMAIL" | "OUTLOOK" | "GCAL" | "MSCAL";
export type NetworkSourceView = { provider: Provider; status: string; stats: Record<string, number> | null; last_sync: string | null };

const LABEL: Record<Provider, string> = { LINKEDIN_CSV: "LinkedIn export", GMAIL: "Gmail", OUTLOOK: "Outlook", GCAL: "Google Calendar", MSCAL: "Microsoft Calendar" };

export function NetworkSources({ sources }: { sources: NetworkSourceView[] }) {
  const router = useRouter();
  const file = useRef<HTMLInputElement | null>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const have = new Map(sources.map((s) => [s.provider, s]));
  const done = (ok: boolean, text: string) => {
    setMsg({ ok, text });
    router.refresh();
  };
  return (
    <Card className="flex flex-col gap-4 p-4 text-[13px]">
      <p className="text-muted">
        Your sources are yours: teammates see that you know someone and how well (strong / medium / weak), never your messages, subjects or calendar details.
      </p>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-36 font-medium text-ink">LinkedIn</span>
          {have.get("LINKEDIN_CSV") ? (
            <Badge tone="positive">
              {have.get("LINKEDIN_CSV")?.stats?.matched?.toLocaleString()} of {have.get("LINKEDIN_CSV")?.stats?.rows?.toLocaleString()} matched ({have.get("LINKEDIN_CSV")?.stats?.matchRate}%)
            </Badge>
          ) : (
            <span className="text-faint">not connected</span>
          )}
          <input
            ref={file}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            aria-label="LinkedIn Connections.csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 20 * 1024 * 1024) return setMsg({ ok: false, text: "The file is larger than 20 MB" });
              start(async () => {
                const r = await networkImportLinkedin(await f.text());
                done(r.ok, r.ok ? `Imported ${r.data.rows.toLocaleString()} connections — ${r.data.matched.toLocaleString()} matched (${r.data.matchRate}%).` : r.error);
                if (file.current) file.current.value = "";
              });
            }}
          />
          <button className={buttonClass("secondary", "sm")} disabled={pending} onClick={() => file.current?.click()}>
            {pending ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {have.get("LINKEDIN_CSV") ? "Replace export" : "Upload Connections.csv"}
          </button>
          {have.get("LINKEDIN_CSV") ? (
            <button className={buttonClass("ghost", "sm")} disabled={pending} onClick={() => start(async () => { const r = await networkRemoveSource("LINKEDIN_CSV"); done(r.ok, r.ok ? "LinkedIn removed." : r.error); })}>
              Remove
            </button>
          ) : null}
        </div>
        <p className="pl-[152px] text-[12px] text-faint">LinkedIn → Settings → Data privacy → Get a copy of your data → Connections. We never scrape LinkedIn.</p>
      </div>
      {(["GMAIL", "GCAL", "OUTLOOK", "MSCAL"] as const).map((p) => {
        const s = have.get(p);
        return (
          <div key={p} className="flex flex-wrap items-center gap-2">
            <span className="w-36 font-medium text-ink">{LABEL[p]}</span>
            {s ? (
              <>
                <Badge tone="positive">{s.stats?.matched?.toLocaleString() ?? 0} people matched</Badge>
                {s.stats?.demo ? <Badge tone="neutral">demo data</Badge> : null}
                <button className={buttonClass("ghost", "sm")} disabled={pending} onClick={() => start(async () => { const r = await networkRemoveSource(p); done(r.ok, r.ok ? `${LABEL[p]} removed.` : r.error); })}>
                  Remove
                </button>
              </>
            ) : (
              <>
                <button className={buttonClass("secondary", "sm")} disabled title="Waiting for Google / Microsoft app verification">
                  Connect {LABEL[p]}
                </button>
                <button className={buttonClass("ghost", "sm")} disabled={pending} onClick={() => start(async () => { const r = await networkConnectDemo(p); done(r.ok, r.ok ? `Demo ${LABEL[p]} connected — ${r.data.matched} people matched.` : r.error); })}>
                  Try with demo data
                </button>
              </>
            )}
          </div>
        );
      })}
      {msg ? <p role="status" className={msg.ok ? "text-positive" : "text-negative"}>{msg.text}</p> : null}
    </Card>
  );
}
