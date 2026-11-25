"use client";
/** Demo, partner and privacy-rights forms (plan 6.16, 6.17). Validation mirrors the server. */
import { useState, type FormEvent, type ReactNode } from "react";
import { buttonClass, cn } from "@founders/ui";
import { FREE_MAIL } from "@/lib/freemail";


const field = "h-11 w-full rounded-lg border border-line bg-white/[0.03] px-3 text-[14px] text-ink placeholder:text-faint focus:border-accent/60 focus:outline-none";

function Label({ children, htmlFor, optional }: { children: ReactNode; htmlFor: string; optional?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] text-text">
      {children}
      {optional ? <span className="text-faint"> ({optional})</span> : <span className="text-accent"> *</span>}
    </label>
  );
}

type Labels = Record<string, string>;

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { error?: string; fieldErrors?: Record<string, string> };
  return { ok: res.ok, data };
}

export function DemoForm({ labels, firmTypes, aum, calLink }: { labels: Labels; firmTypes: string[]; aum: string[]; calLink?: string }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    const errs: Record<string, string> = {};
    for (const k of ["firstName", "lastName", "email", "firmType", "aum"]) if (!fd[k]) errs[k] = labels.required ?? "Required";
    const domain = (fd.email ?? "").split("@")[1]?.toLowerCase() ?? "";
    if (fd.email && (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(fd.email) || FREE_MAIL.includes(domain))) errs.email = labels.freeMail ?? "Work email";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setState("sending");
    const { ok, data } = await post("/api/leads", { kind: "DEMO", ...fd });
    if (ok) setState("done");
    else {
      setErrors(data.fieldErrors ?? {});
      setState("error");
    }
  }
  if (state === "done")
    return (
      <div className="flex flex-col gap-4 rounded-[12px] border border-accent/30 bg-accent-soft p-6">
        <p className="font-display text-[20px] text-ink">{labels.success}</p>
        {calLink ? (
          <>
            <p className="text-[14px] text-muted">{labels.successBook}</p>
            <iframe title="Book a time" src={`https://cal.com/${calLink}?embed=true&theme=dark`} className="h-[640px] w-full rounded-lg border border-line" />
          </>
        ) : null}
      </div>
    );
  const err = (k: string) => (errors[k] ? <p className="mt-1 text-[12px] text-negative">{errors[k]}</p> : null);
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="firstName">{labels.firstName}</Label>
          <input id="firstName" name="firstName" autoComplete="given-name" className={field} aria-invalid={Boolean(errors.firstName)} />
          {err("firstName")}
        </div>
        <div>
          <Label htmlFor="lastName">{labels.lastName}</Label>
          <input id="lastName" name="lastName" autoComplete="family-name" className={field} aria-invalid={Boolean(errors.lastName)} />
          {err("lastName")}
        </div>
      </div>
      <div>
        <Label htmlFor="email">{labels.email}</Label>
        <input id="email" name="email" type="email" autoComplete="email" className={field} aria-invalid={Boolean(errors.email)} />
        {err("email")}
      </div>
      <div>
        <Label htmlFor="company" optional={labels.optional}>
          {labels.company}
        </Label>
        <input id="company" name="company" autoComplete="organization" className={field} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="firmType">{labels.firmType}</Label>
          <select id="firmType" name="firmType" defaultValue="" className={cn(field, "appearance-none")} aria-invalid={Boolean(errors.firmType)}>
            <option value="" disabled>
              —
            </option>
            {firmTypes.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
          {err("firmType")}
        </div>
        <div>
          <Label htmlFor="aum">{labels.aum}</Label>
          <select id="aum" name="aum" defaultValue="" className={cn(field, "appearance-none")} aria-invalid={Boolean(errors.aum)}>
            <option value="" disabled>
              —
            </option>
            {aum.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
          {err("aum")}
        </div>
      </div>
      <div>
        <Label htmlFor="phone" optional={labels.optional}>
          {labels.phone}
        </Label>
        <input id="phone" name="phone" type="tel" autoComplete="tel" className={field} />
      </div>
      {/* honeypot (Turnstile replaces this once keys are configured — H3) */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <button type="submit" disabled={state === "sending"} className={buttonClass("primary", "lg", "mt-2")}>
        {state === "sending" ? labels.submitting : labels.submit}
      </button>
      {state === "error" ? <p className="text-[13px] text-negative">{labels.error}</p> : null}
    </form>
  );
}

export function PartnerForm({ labels, types }: { labels: Labels; types: string[] }) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    setState("sending");
    const { ok } = await post("/api/leads", { kind: "PARTNER", ...fd });
    setState(ok ? "done" : "error");
  }
  if (state === "done") return <p className="rounded-[12px] border border-accent/30 bg-accent-soft p-6 font-display text-[18px] text-ink">{labels.success}</p>;
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <div>
        <Label htmlFor="pfirst">{labels.firstName}</Label>
        <input id="pfirst" name="firstName" required className={field} />
      </div>
      <div>
        <Label htmlFor="plast">{labels.lastName}</Label>
        <input id="plast" name="lastName" required className={field} />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="pemail">{labels.email}</Label>
        <input id="pemail" name="email" type="email" required className={field} />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="ptype">{labels.type}</Label>
        <select id="ptype" name="partnershipType" required defaultValue="" className={field}>
          <option value="" disabled>
            —
          </option>
          {types.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="pidea">{labels.idea}</Label>
        <textarea id="pidea" name="message" required rows={4} className={cn(field, "h-auto py-2")} />
      </div>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <button type="submit" disabled={state === "sending"} className={buttonClass("primary", "lg", "sm:col-span-2")}>
        {labels.submit}
      </button>
      {state === "error" ? <p className="text-[13px] text-negative">{labels.error}</p> : null}
    </form>
  );
}

export function DsarForm({ labels, types, defaultType }: { labels: Labels; types: Record<string, string>; defaultType?: string }) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    setState("sending");
    const { ok } = await post("/api/dsar", fd);
    setState(ok ? "done" : "error");
  }
  if (state === "done") return <p className="rounded-[12px] border border-accent/30 bg-accent-soft p-6 text-[15px] text-ink">{labels.success}</p>;
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <Label htmlFor="dtype">{labels.type}</Label>
        <select id="dtype" name="type" defaultValue={defaultType ?? "ACCESS"} className={field}>
          {Object.entries(types).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="dname">{labels.name}</Label>
        <input id="dname" name="fullName" required className={field} />
      </div>
      <div>
        <Label htmlFor="demail">{labels.email}</Label>
        <input id="demail" name="email" type="email" required className={field} />
      </div>
      <div>
        <Label htmlFor="ddetails" optional="optional">
          {labels.details}
        </Label>
        <textarea id="ddetails" name="details" rows={3} className={cn(field, "h-auto py-2")} />
      </div>
      <button type="submit" disabled={state === "sending"} className={buttonClass("primary", "lg")}>
        {labels.submit}
      </button>
    </form>
  );
}
