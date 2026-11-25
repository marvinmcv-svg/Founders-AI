"use client";
/** First-run onboarding (plan 7.1b): role & firm → thesis → suggested saved searches → invite. Skippable. */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { buttonClass, Chip, cn } from "@founders/ui";
import { saveThesis } from "@/app/actions";
import { InviteForm } from "../settings/SettingsClient";

const FIRMS = ["VC", "PE", "Growth equity", "Corporate VC / Corp Dev", "M&A advisory", "Family office", "Angel", "Accelerator", "GTM / Sales"];
const ROLES = ["Partner", "Principal", "Associate / Analyst", "Platform", "Corp Dev", "Sales / BD", "Other"];

export function Onboarding({ initial, sectors, stages, regions }: { initial: Record<string, unknown>; sectors: { value: string; label: string }[]; stages: string[]; regions: string[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const arr = (k: string) => (Array.isArray(initial[k]) ? (initial[k] as string[]) : []);
  const [t, setT] = useState({ role: String(initial.role ?? ""), firmType: String(initial.firmType ?? ""), sectors: arr("sectors"), stages: arr("stages"), geographies: arr("geographies"), checkSize: String(initial.checkSize ?? "") });
  const [pending, start] = useTransition();
  const toggle = (k: "sectors" | "stages" | "geographies", v: string) => setT((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((y) => y !== v) : [...x[k], v] }));
  const steps = ["Role & firm", "Thesis", "Saved searches", "Invite team"];
  const pick = (label: string, opts: { value: string; label: string }[], k: "sectors" | "stages" | "geographies") => (
    <div>
      <p className="mb-2 text-[13px] text-muted">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {opts.map((o) => (
          <button key={o.value} onClick={() => toggle(k, o.value)}>
            <Chip active={t[k].includes(o.value)}>{o.label}</Chip>
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <div className="flex gap-2">
        {steps.map((s, i) => (
          <div key={s} className="flex-1">
            <div className={cn("h-1 rounded-full", i <= step ? "bg-accent" : "bg-white/10")} />
            <p className={cn("mt-1.5 text-[11.5px]", i === step ? "text-ink" : "text-faint")}>{s}</p>
          </div>
        ))}
      </div>
      {step === 0 ? (
        <>
          <h1 className="text-[26px] font-semibold">What do you do?</h1>
          <div className="flex flex-wrap gap-1.5">{ROLES.map((r) => <button key={r} onClick={() => setT({ ...t, role: r })}><Chip active={t.role === r}>{r}</Chip></button>)}</div>
          <p className="text-[13px] text-muted">Firm type</p>
          <div className="flex flex-wrap gap-1.5">{FIRMS.map((r) => <button key={r} onClick={() => setT({ ...t, firmType: r })}><Chip active={t.firmType === r}>{r}</Chip></button>)}</div>
        </>
      ) : null}
      {step === 1 ? (
        <>
          <h1 className="text-[26px] font-semibold">Your thesis</h1>
          {pick("Sectors", sectors, "sectors")}
          {pick("Stages", stages.map((s) => ({ value: s, label: s })), "stages")}
          {pick("Geographies", regions.map((s) => ({ value: s, label: s })), "geographies")}
          <input value={t.checkSize} onChange={(e) => setT({ ...t, checkSize: e.target.value })} placeholder="Typical check size, e.g. $250K–$1M" className="h-10 rounded-lg border border-line bg-white/[0.03] px-3 text-[14px] text-ink outline-none" />
        </>
      ) : null}
      {step === 2 ? (
        <>
          <h1 className="text-[26px] font-semibold">We'll watch this for you</h1>
          <p className="text-[14px] text-muted">We'll create two saved searches from your thesis — "My thesis" (daily digest) and "My thesis — fast growers" (weekly) — so new matches show up automatically.</p>
        </>
      ) : null}
      {step === 3 ? (
        <>
          <h1 className="text-[26px] font-semibold">Invite your team</h1>
          <InviteForm />
        </>
      ) : null}
      <div className="flex justify-between">
        <button className={buttonClass("ghost")} onClick={() => router.push("/companies")}>Skip</button>
        <div className="flex gap-2">
          {step > 0 ? <button className={buttonClass("secondary")} onClick={() => setStep(step - 1)}>Back</button> : null}
          {step < 3 ? (
            <button className={buttonClass("primary")} disabled={pending} onClick={() => { if (step === 2) start(async () => { await saveThesis(t, true); setStep(3); }); else setStep(step + 1); }}>
              {step === 2 ? "Create searches" : "Continue"}
            </button>
          ) : (
            <button className={buttonClass("primary")} onClick={() => router.push("/searches")}>Finish</button>
          )}
        </div>
      </div>
    </div>
  );
}
