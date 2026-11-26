"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarClock, Copy, Lock, Pencil, Play, Plus, Trash2, Users } from "lucide-react";
import { Badge, Button, Card, cn } from "@founders/ui";
import { deleteAgentSchedule, deleteAgentSkill, saveAgentSkill, scheduleAgentSkill } from "@/app/agent-actions";

type InputDef = { name: string; label: string; kind: "text" | "company" | "person" | "investor" | "list" | "search" };
type Curated = { slug: string; name: string; description: string; steps: string[]; outputFormat: string; inputs: InputDef[] };
type Own = Curated & { id: string; visibility: "PRIVATE" | "TEAM"; status: "DRAFT" | "SAVED"; ownerId: string; ownerName: string };
type Schedule = { id: string; skillSlug: string; prompt: string; cadence: "DAILY" | "WEEKLY"; weekday: number | null; hour: number; timezone: string; channels: string[]; lastRunAt: string | null; lastThreadId: string | null };
type Draft = { id?: string; slug: string; name: string; description: string; steps: string; outputFormat: string; visibility: "PRIVATE" | "TEAM" };

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const input = "w-full rounded-md border border-line bg-sunken px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-accent/60";

function Editor({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const router = useRouter();
  const [d, setD] = useState(draft);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = (status: "DRAFT" | "SAVED") =>
    start(async () => {
      const r = await saveAgentSkill({ slug: d.slug.trim().toLowerCase(), name: d.name.trim(), description: d.description.trim(), steps: d.steps.split("\n"), outputFormat: d.outputFormat, visibility: d.visibility, status }, d.id);
      if (!r.ok) return setErr(r.error);
      router.refresh();
      onClose();
    });
  return (
    <Card className="mb-6 p-5">
      <h2 className="mb-3 text-[15px] font-semibold text-ink">{d.id ? "Edit skill" : "New skill"}</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-[12px] text-muted">Name<input className={input} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value, slug: d.id || d.slug ? d.slug : e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) })} /></label>
        <label className="flex flex-col gap-1 text-[12px] text-muted">Command<div className="flex items-center gap-1"><span className="text-faint">/</span><input className={input} value={d.slug} onChange={(e) => setD({ ...d, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} /></div></label>
        <label className="flex flex-col gap-1 text-[12px] text-muted md:col-span-2">Description<input className={input} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} /></label>
        <label className="flex flex-col gap-1 text-[12px] text-muted md:col-span-2">Steps (one per line, in plain English)<textarea rows={6} className={input} value={d.steps} onChange={(e) => setD({ ...d, steps: e.target.value })} /></label>
        <label className="flex flex-col gap-1 text-[12px] text-muted md:col-span-2">Output template (optional)<input className={input} value={d.outputFormat} onChange={(e) => setD({ ...d, outputFormat: e.target.value })} placeholder="## Summary · ## Risks · ## Next steps" /></label>
        <label className="flex items-center gap-2 text-[12.5px] text-muted"><input type="checkbox" checked={d.visibility === "TEAM"} onChange={(e) => setD({ ...d, visibility: e.target.checked ? "TEAM" : "PRIVATE" })} /> Share with my team</label>
      </div>
      {err ? <p className="mt-3 text-[12.5px] text-red-400">{err}</p> : null}
      <div className="mt-4 flex gap-2">
        <Button size="sm" onClick={() => save("SAVED")} disabled={pending}>Save</Button>
        <Button size="sm" variant="secondary" onClick={() => save("DRAFT")} disabled={pending}>Save draft</Button>
        <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </Card>
  );
}

function ScheduleForm({ slug, onClose }: { slug: string; onClose: () => void }) {
  const router = useRouter();
  const [cadence, setCadence] = useState<"DAILY" | "WEEKLY">("WEEKLY");
  const [weekday, setWeekday] = useState(1);
  const [hour, setHour] = useState(7);
  const [prompt, setPrompt] = useState("");
  const [slack, setSlack] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-line bg-sunken/60 p-3 text-[12.5px]">
      <label className="flex flex-col gap-1 text-muted">Every<select className={input} value={cadence} onChange={(e) => setCadence(e.target.value as "DAILY" | "WEEKLY")}><option value="DAILY">Day</option><option value="WEEKLY">Week</option></select></label>
      {cadence === "WEEKLY" ? <label className="flex flex-col gap-1 text-muted">On<select className={input} value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></label> : null}
      <label className="flex flex-col gap-1 text-muted">At<select className={input} value={hour} onChange={(e) => setHour(Number(e.target.value))}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}</select></label>
      <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-muted">Input (optional)<input className={input} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. fintech in Mexico" /></label>
      <label className="flex items-center gap-1.5 pb-2 text-muted"><input type="checkbox" checked={slack} onChange={(e) => setSlack(e.target.checked)} /> Also post to Slack</label>
      <Button size="sm" disabled={pending} onClick={() => start(async () => { const r = await scheduleAgentSkill({ skillSlug: slug, prompt, cadence, weekday, hour, timezone: tz, channels: slack ? ["in_app", "slack"] : ["in_app"] }); if (!r.ok) return setErr(r.error); router.refresh(); onClose(); })}>Schedule</Button>
      <span className="pb-2 text-faint">{tz}</span>
      {err ? <p className="w-full text-red-400">{err}</p> : null}
    </div>
  );
}

function SkillCard({ s, badge, actions, scheduling, onCloseSchedule }: { s: Curated; badge?: React.ReactNode; actions: React.ReactNode; scheduling: boolean; onCloseSchedule: () => void }) {
  return (
    <Card className="flex flex-col p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-mono text-[13px] text-accent">/{s.slug}</span>
        {badge}
      </div>
      <h3 className="text-[14px] font-medium text-ink">{s.name}</h3>
      <p className="mb-2 text-[12.5px] text-muted">{s.description}</p>
      <ol className="mb-3 list-decimal pl-4 text-[12px] text-faint">{s.steps.slice(0, 4).map((st, i) => <li key={i}>{st}</li>)}{s.steps.length > 4 ? <li className="list-none">…</li> : null}</ol>
      <div className="mt-auto flex flex-wrap gap-1.5">{actions}</div>
      {scheduling ? <ScheduleForm slug={s.slug} onClose={onCloseSchedule} /> : null}
    </Card>
  );
}

export function SkillsClient({ curated, own, schedules, userId }: { curated: Curated[]; own: Own[]; schedules: Schedule[]; userId: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [scheduling, setScheduling] = useState<string | null>(null);
  const [, start] = useTransition();
  const blank: Draft = { slug: "", name: "", description: "", steps: "", outputFormat: "", visibility: "PRIVATE" };
  const runLink = (slug: string) => `/agent?q=${encodeURIComponent(`/${slug} `)}`;
  const iconBtn = "flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[12px] text-muted hover:border-line-strong hover:text-ink";

  return (
    <>
      <div className="mb-5 flex gap-2">
        <Button size="sm" onClick={() => setDraft(blank)}><Plus size={14} className="mr-1" /> New skill</Button>
      </div>
      {draft ? <Editor key={draft.id ?? "new"} draft={draft} onClose={() => setDraft(null)} /> : null}

      {schedules.length ? (
        <section className="mb-8">
          <h2 className="mb-2 text-[12px] uppercase tracking-wide text-faint">Scheduled</h2>
          <Card className="divide-y divide-line">
            {schedules.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                <CalendarClock size={15} className="text-accent" />
                <span className="font-mono text-ink">/{s.skillSlug}</span>
                {s.prompt ? <span className="text-muted">{s.prompt}</span> : null}
                <span className="text-muted">{s.cadence === "WEEKLY" ? `Every ${DAYS[s.weekday ?? 1]}` : "Every day"} at {String(s.hour).padStart(2, "0")}:00 ({s.timezone})</span>
                <span className="text-faint">{s.channels.join(" + ")}</span>
                {s.lastThreadId ? <Link href={`/agent/${s.lastThreadId}`} className="text-[12px] text-accent">Last run</Link> : <span className="text-[12px] text-faint">Not run yet</span>}
                <button className="ml-auto text-faint hover:text-red-400" title="Remove schedule" onClick={() => start(async () => { await deleteAgentSchedule(s.id); router.refresh(); })}><Trash2 size={14} /></button>
              </div>
            ))}
          </Card>
        </section>
      ) : null}

      {own.length ? (
        <section className="mb-8">
          <h2 className="mb-2 text-[12px] uppercase tracking-wide text-faint">Your workspace</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {own.map((s) => {
              const mine = s.ownerId === userId;
              return (
                <SkillCard
                  key={s.id}
                  s={s}
                  scheduling={scheduling === s.slug}
                  onCloseSchedule={() => setScheduling(null)}
                  badge={<span className="flex items-center gap-1.5">{s.status === "DRAFT" ? <Badge tone="warning">Draft</Badge> : null}{s.visibility === "TEAM" ? <Badge tone="info"><Users size={11} className="mr-1 inline" />Team</Badge> : <Badge tone="neutral"><Lock size={11} className="mr-1 inline" />Private</Badge>}</span>}
                  actions={<>
                    {s.status === "SAVED" ? <Link href={runLink(s.slug)} className={iconBtn}><Play size={12} /> Run</Link> : null}
                    {s.status === "SAVED" ? <button className={iconBtn} onClick={() => setScheduling(scheduling === s.slug ? null : s.slug)}><CalendarClock size={12} /> Schedule</button> : null}
                    {mine ? <button className={iconBtn} onClick={() => setDraft({ id: s.id, slug: s.slug, name: s.name, description: s.description, steps: s.steps.join("\n"), outputFormat: s.outputFormat, visibility: s.visibility })}><Pencil size={12} /> Edit</button> : <span className="px-1 py-1 text-[11.5px] text-faint">by {s.ownerName}</span>}
                    {!mine ? <button className={iconBtn} onClick={() => setDraft({ slug: `${s.slug}-copy`.slice(0, 40), name: `${s.name} (copy)`, description: s.description, steps: s.steps.join("\n"), outputFormat: s.outputFormat, visibility: "PRIVATE" })}><Copy size={12} /> Duplicate</button> : null}
                    {mine ? <button className={cn(iconBtn, "hover:text-red-400")} onClick={() => start(async () => { if (confirm(`Delete /${s.slug}?`)) { await deleteAgentSkill(s.id); router.refresh(); } })}><Trash2 size={12} /></button> : null}
                  </>}
                />
              );
            })}
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="mb-2 text-[12px] uppercase tracking-wide text-faint">Library</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {curated.map((s) => (
            <SkillCard
              key={s.slug}
              s={s}
              scheduling={scheduling === s.slug}
              onCloseSchedule={() => setScheduling(null)}
              badge={<Badge tone="neutral">Curated</Badge>}
              actions={<>
                <Link href={runLink(s.slug)} className={iconBtn}><Play size={12} /> Run</Link>
                <button className={iconBtn} onClick={() => setScheduling(scheduling === s.slug ? null : s.slug)}><CalendarClock size={12} /> Schedule</button>
                <button className={iconBtn} onClick={() => setDraft({ slug: s.slug, name: s.name, description: s.description, steps: s.steps.join("\n"), outputFormat: s.outputFormat, visibility: "PRIVATE" })}><Copy size={12} /> Duplicate</button>
              </>}
            />
          ))}
        </div>
      </section>
    </>
  );
}
