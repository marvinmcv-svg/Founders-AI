"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Card } from "@founders/ui";
import { disconnectMcpApp, setMcpOverageAction } from "@/app/mcp-actions";

type Usage = { user_id: string; name: string; email: string; today: number; last_30d: number; credits_30d: number };
type Conn = { client_id: string; name: string | null; created_at: string };

export function McpSettings({ overage, isAdmin, usage, connections, freePerDay }: { overage: boolean; isAdmin: boolean; usage: Usage[]; connections: Conn[]; freePerDay: number }) {
  const router = useRouter();
  const [on, setOn] = useState(overage);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex items-center justify-between gap-4 p-4">
        <div>
          <p className="text-[13.5px] text-ink">Allow overage on credits</p>
          <p className="text-[12px] text-muted">After {freePerDay} free calls per user per day, paid tools draw workspace credits. Off: they pause until 00:00 UTC (free tools keep working).</p>
        </div>
        <label className="flex items-center gap-2 text-[12.5px] text-muted">
          <input
            type="checkbox"
            role="switch"
            aria-label="Allow MCP overage on credits"
            checked={on}
            disabled={!isAdmin || pending}
            onChange={(e) => {
              const v = e.target.checked;
              setOn(v);
              start(async () => {
                await setMcpOverageAction(v);
                router.refresh();
              });
            }}
          />
          {isAdmin ? (on ? "On" : "Off") : "Admins only"}
        </label>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="overflow-hidden">
          <p className="border-b border-line px-3 py-2 text-[11px] uppercase tracking-wide text-faint">Usage by person</p>
          {usage.length ? (
            <table className="w-full text-[12.5px]">
              <thead><tr className="text-left text-[11px] text-faint"><th className="px-3 py-1.5 font-medium">Person</th><th className="px-3 py-1.5 text-right font-medium">Today</th><th className="px-3 py-1.5 text-right font-medium">30 days</th><th className="px-3 py-1.5 text-right font-medium">Credits</th></tr></thead>
              <tbody>{usage.map((u) => <tr key={u.user_id} className="border-t border-line/60"><td className="px-3 py-1.5">{u.name}</td><td className="px-3 py-1.5 text-right">{u.today}/{freePerDay}</td><td className="px-3 py-1.5 text-right">{u.last_30d}</td><td className="px-3 py-1.5 text-right">{u.credits_30d}</td></tr>)}</tbody>
            </table>
          ) : <p className="px-3 py-4 text-[12.5px] text-muted">No MCP calls in the last 30 days.</p>}
        </Card>
        <Card className="overflow-hidden">
          <p className="border-b border-line px-3 py-2 text-[11px] uppercase tracking-wide text-faint">Your connected apps</p>
          {connections.length ? connections.map((c) => (
            <div key={c.client_id} className="flex items-center justify-between border-t border-line/60 px-3 py-2 text-[12.5px] first:border-0">
              <span><span className="text-ink">{c.name ?? "Unnamed app"}</span> <span className="text-faint">· since {new Date(c.created_at).toLocaleDateString()}</span></span>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { await disconnectMcpApp(c.client_id); router.refresh(); })}>Disconnect</Button>
            </div>
          )) : <p className="px-3 py-4 text-[12.5px] text-muted">No apps connected yet.</p>}
        </Card>
      </div>
    </div>
  );
}
