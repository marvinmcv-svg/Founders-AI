"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge, buttonClass, Card } from "@founders/ui";
import { connectSlack, disconnectSlack, testSlackConnection } from "@/app/actions";

const input = "h-9 rounded-md border border-line bg-white/[0.03] px-2.5 text-[13px] text-ink outline-none focus:border-accent/50";

export function SlackIntegration({ connected, target, isAdmin }: { connected: boolean; target: string | null; isAdmin: boolean }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <Card className="flex flex-col gap-3 p-4 text-[13px]">
      <div className="flex items-center gap-2">
        <span className="font-medium text-ink">Slack</span>
        {connected ? <Badge tone="positive">connected</Badge> : <Badge tone="neutral">not connected</Badge>}
        {target ? <code className="text-[12px] text-muted">{target}</code> : null}
      </div>
      <p className="text-muted">
        Real-time saved-search alerts post to one channel through a Slack incoming webhook. The webhook URL is stored encrypted and only ever called through our egress proxy.
      </p>
      {isAdmin ? (
        <>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await connectSlack(url);
                setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error ?? "Failed" });
                if (r.ok) setUrl("");
                router.refresh();
              });
            }}
          >
            <label className="sr-only" htmlFor="slack-url">Slack incoming webhook URL</label>
            <input id="slack-url" className={`${input} min-w-[320px] flex-1`} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://hooks.slack.com/services/…" />
            <button className={buttonClass("primary", "sm")} disabled={pending || !url.trim()}>{connected ? "Replace" : "Connect"}</button>
          </form>
          {connected ? (
            <div className="flex gap-2">
              <button className={buttonClass("secondary", "sm")} disabled={pending} onClick={() => start(async () => { const r = await testSlackConnection(); setMsg(r.ok ? { ok: true, text: "Test message sent." } : { ok: false, text: r.error ?? "Failed" }); })}>
                Send test message
              </button>
              <button className={buttonClass("danger", "sm")} disabled={pending} onClick={() => start(async () => { await disconnectSlack(); setMsg(null); router.refresh(); })}>
                Disconnect
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-faint">Ask a workspace admin to connect Slack.</p>
      )}
      {msg ? <p className={msg.ok ? "text-positive" : "text-negative"} role="status">{msg.text}</p> : null}
    </Card>
  );
}
