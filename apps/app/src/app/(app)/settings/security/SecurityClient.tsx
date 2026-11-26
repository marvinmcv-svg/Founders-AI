"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge, buttonClass, Card } from "@founders/ui";
import { authClient } from "@/lib/auth-client";
import {
  auditTwoFactorAction, createScimTokenAction, deleteSsoAction, registerSsoAction, requestDomainTokenAction, revokeScimTokenAction, setPolicyAction, verifyDomainAction,
} from "@/app/security-actions";

const input = "h-9 rounded-md border border-line bg-white/[0.03] px-2.5 text-[13px] text-ink outline-none focus:border-accent/50";
const Err = ({ e }: { e: string | null }) => (e ? <p role="alert" className="text-[12.5px] text-negative">{e}</p> : null);

/* ---------------- 2FA ---------------- */

export function TwoFactorPanel({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<"idle" | "password" | "scan" | "disable">("idle");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<{ uri: string; secret: string; backup: string[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const begin = () =>
    start(async () => {
      setErr(null);
      const { data, error } = await authClient.twoFactor.enable({ password });
      if (error || !data) return setErr(error?.message ?? "Could not start setup");
      if (!("totpURI" in data)) return setErr("Authenticator setup is not available");
      const secret = new URL(data.totpURI).searchParams.get("secret") ?? "";
      setSetup({ uri: data.totpURI, secret, backup: data.backupCodes });
      setStep("scan");
    });
  const confirm = () =>
    start(async () => {
      setErr(null);
      const { error } = await authClient.twoFactor.verifyTotp({ code: code.trim() });
      if (error) return setErr(error.message ?? "That code didn't match");
      await auditTwoFactorAction(true);
      setStep("idle");
      router.refresh();
    });
  const disable = () =>
    start(async () => {
      setErr(null);
      const { error } = await authClient.twoFactor.disable({ password });
      if (error) return setErr(error.message ?? "Could not turn it off");
      await auditTwoFactorAction(false);
      setStep("idle");
      router.refresh();
    });
  return (
    <Card className="flex flex-col gap-3 p-4 text-[13px]">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-ink">Authenticator app</span>
        <Badge tone={enabled ? "positive" : "neutral"}>{enabled ? "on" : "off"}</Badge>
        {step === "idle" ? (
          enabled ? <button className={buttonClass("secondary", "sm", "ml-auto")} onClick={() => setStep("disable")}>Turn off</button> : <button className={buttonClass("primary", "sm", "ml-auto")} onClick={() => setStep("password")}>Set up</button>
        ) : null}
      </div>
      {step === "password" || step === "disable" ? (
        <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (step === "password") begin(); else disable(); }}>
          <input type="password" aria-label="Your password" placeholder="Your password" className={`${input} w-60`} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          <button className={buttonClass(step === "disable" ? "danger" : "primary", "sm")} disabled={pending || !password}>{step === "disable" ? "Turn off 2FA" : "Continue"}</button>
          <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setStep("idle")}>Cancel</button>
        </form>
      ) : null}
      {step === "scan" && setup ? (
        <div className="flex flex-col gap-3">
          <p className="text-muted">Add this account to your authenticator app (on a phone, <a href={setup.uri} className="text-accent hover:underline">open it directly</a>), or type the key:</p>
          <code data-testid="totp-secret" className="w-fit rounded bg-black/40 px-3 py-2 font-mono text-[14px] tracking-wider text-accent">{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</code>
          <p className="text-muted">Backup codes (each works once; store them somewhere safe):</p>
          <div className="grid w-fit grid-cols-2 gap-x-6 gap-y-1 font-mono text-[12.5px] text-ink sm:grid-cols-4">{setup.backup.map((b) => <span key={b}>{b}</span>)}</div>
          <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); confirm(); }}>
            <input aria-label="6-digit code" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" className={`${input} w-32 tracking-widest`} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
            <button className={buttonClass("primary", "sm")} disabled={pending || code.length !== 6}>Verify & turn on</button>
          </form>
        </div>
      ) : null}
      <Err e={err} />
    </Card>
  );
}

/* ---------------- SSO providers ---------------- */

type Provider = { providerId: string; protocol: "OIDC" | "SAML"; domain: string; issuer: string; verified: boolean };

function ProviderRow({ p }: { p: Provider }) {
  const router = useRouter();
  const [txt, setTxt] = useState<{ record: string; value: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2 px-4 py-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-ink">{p.domain}</span>
        <Badge tone="neutral">{p.protocol}</Badge>
        <Badge tone={p.verified ? "positive" : "warning"}>{p.verified ? "verified" : "domain not verified"}</Badge>
        <code className="text-[11.5px] text-faint">{p.providerId}</code>
        <span className="ml-auto flex gap-2">
          {!p.verified ? (
            <>
              <button className={buttonClass("secondary", "sm")} disabled={pending} onClick={() => start(async () => { const r = await requestDomainTokenAction(p.providerId); if (r.ok && r.data) setTxt(r.data); else if (!r.ok) setMsg({ ok: false, text: r.error }); })}>DNS record</button>
              <button className={buttonClass("primary", "sm")} disabled={pending} onClick={() => start(async () => { const r = await verifyDomainAction(p.providerId); setMsg(r.ok ? { ok: true, text: r.message ?? "Verified" } : { ok: false, text: r.error }); if (r.ok) router.refresh(); })}>Verify</button>
            </>
          ) : null}
          <button className={buttonClass("ghost", "sm")} disabled={pending} onClick={() => window.confirm(`Remove ${p.domain} SSO?`) && start(async () => { const r = await deleteSsoAction(p.providerId); if (!r.ok) setMsg({ ok: false, text: r.error }); else router.refresh(); })}>Remove</button>
        </span>
      </div>
      <span className="text-[11.5px] text-faint">Issuer {p.issuer}</span>
      {txt ? (
        <p className="font-mono text-[11.5px] text-muted">Add a DNS TXT record <span className="text-ink">{txt.record}.{p.domain}</span> with value <span className="break-all text-ink">{txt.value}</span>, then press Verify.</p>
      ) : null}
      {msg ? <p role={msg.ok ? "status" : "alert"} className={`text-[12.5px] ${msg.ok ? "text-positive" : "text-negative"}`}>{msg.text}</p> : null}
    </div>
  );
}

export function SsoProviders({ providers }: { providers: Provider[] }) {
  const router = useRouter();
  const [protocol, setProtocol] = useState<"oidc" | "saml">("oidc");
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      <Card className="divide-y divide-line">
        {providers.map((p) => <ProviderRow key={p.providerId} p={p} />)}
        {!providers.length ? <p className="px-4 py-3 text-[13px] text-muted">No identity provider connected.</p> : null}
      </Card>
      {!open ? <button className={buttonClass("secondary", "sm", "self-start")} onClick={() => setOpen(true)}>Add identity provider</button> : (
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex gap-2 text-[13px]">
            {(["oidc", "saml"] as const).map((x) => <button key={x} type="button" className={buttonClass(protocol === x ? "primary" : "ghost", "sm")} onClick={() => setProtocol(x)}>{x.toUpperCase()}</button>)}
          </div>
          <form
            className="grid gap-2 md:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              const v = Object.fromEntries([...new FormData(e.currentTarget).entries()].map(([k, x]) => [k, String(x)]));
              start(async () => {
                setErr(null);
                const r = await registerSsoAction({ ...v, protocol });
                if (!r.ok) return setErr(r.error);
                setOpen(false);
                router.refresh();
              });
            }}
          >
            <label className="flex flex-col gap-1 text-[11.5px] text-faint">E-mail domain<input name="domain" required placeholder="fund.com" className={input} /></label>
            <label className="flex flex-col gap-1 text-[11.5px] text-faint">Provider ID (slug)<input name="providerId" placeholder="fund-okta" className={input} /></label>
            {protocol === "oidc" ? (
              <>
                <label className="flex flex-col gap-1 text-[11.5px] text-faint md:col-span-2">Discovery URL<input name="discoveryUrl" required placeholder="https://fund.okta.com/.well-known/openid-configuration" className={input} /></label>
                <label className="flex flex-col gap-1 text-[11.5px] text-faint">Client ID<input name="clientId" required className={input} /></label>
                <label className="flex flex-col gap-1 text-[11.5px] text-faint">Client secret<input name="clientSecret" type="password" required className={input} /></label>
              </>
            ) : (
              <>
                <label className="flex flex-col gap-1 text-[11.5px] text-faint">IdP entity ID<input name="issuer" required placeholder="http://www.okta.com/exk…" className={input} /></label>
                <label className="flex flex-col gap-1 text-[11.5px] text-faint">IdP SSO URL<input name="entryPoint" required placeholder="https://fund.okta.com/app/…/sso/saml" className={input} /></label>
                <label className="flex flex-col gap-1 text-[11.5px] text-faint md:col-span-2">Signing certificate (PEM)<textarea name="cert" required rows={4} className={`${input} h-auto py-2 font-mono text-[11px]`} placeholder="-----BEGIN CERTIFICATE-----" /></label>
              </>
            )}
            <span className="flex items-center gap-2 md:col-span-2">
              <button className={buttonClass("primary", "sm")} disabled={pending}>{pending ? "Checking…" : "Add provider"}</button>
              <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setOpen(false)}>Cancel</button>
            </span>
          </form>
          <Err e={err} />
        </Card>
      )}
    </div>
  );
}

/* ---------------- Policies ---------------- */

export function PolicyToggles({ requireSso, require2fa, canRequireSso }: { requireSso: boolean; require2fa: boolean; canRequireSso: boolean }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (p: { requireSso?: boolean; require2fa?: boolean }) =>
    start(async () => {
      setErr(null);
      const r = await setPolicyAction(p);
      if (!r.ok) setErr(r.error);
      else router.refresh();
    });
  const Row = ({ label, sub, on, onChange, disabled }: { label: string; sub: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) => (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 text-[13px]">
      <div className="flex-1"><p className="text-ink">{label}</p><p className="text-[12px] text-muted">{sub}</p></div>
      <button role="switch" aria-checked={on} aria-label={label} disabled={pending || disabled} onClick={() => onChange(!on)} className={`h-6 w-11 rounded-full p-0.5 transition ${on ? "bg-accent" : "bg-white/10"} disabled:opacity-40`}>
        <span className={`block h-5 w-5 rounded-full bg-black transition ${on ? "translate-x-5" : ""}`} />
      </button>
    </div>
  );
  return (
    <div className="flex flex-col gap-2">
      <Card className="divide-y divide-line">
        <Row label="Require SSO" sub={canRequireSso ? "Members must sign in through your identity provider. Password sessions are sent to SSO." : "Add and verify an identity provider first."} on={requireSso} disabled={!canRequireSso && !requireSso} onChange={(v) => set({ requireSso: v })} />
        <Row label="Require two-factor authentication" sub="Members signing in with a password must have 2FA on; they're sent to set it up." on={require2fa} onChange={(v) => set({ require2fa: v })} />
      </Card>
      <Err e={err} />
    </div>
  );
}

/* ---------------- SCIM tokens ---------------- */

export function ScimTokens({ tokens }: { tokens: { id: string; name: string; prefix: string; created_at: string; last_used_at: string | null; revoked_at: string | null }[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { setErr(null); const r = await createScimTokenAction(name); if (!r.ok) return setErr(r.error); setSecret(r.data?.secret ?? null); setName(""); router.refresh(); }); }}>
        <input aria-label="Token name" className={`${input} w-64`} placeholder="Okta provisioning" value={name} onChange={(e) => setName(e.target.value)} />
        <button className={buttonClass("primary", "sm")} disabled={pending}>New SCIM token</button>
      </form>
      {secret ? (
        <Card className="border-accent/40 p-3 text-[13px]">
          <p className="text-ink">Copy this token into your identity provider now. It won't be shown again.</p>
          <code data-testid="scim-secret" className="mt-1 block break-all rounded bg-black/40 p-2 font-mono text-accent">{secret}</code>
        </Card>
      ) : null}
      <Card className="divide-y divide-line">
        {tokens.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[13px]">
            <span className="text-ink">{t.name}</span>
            <code className="text-[12px] text-muted">{t.prefix}…</code>
            <Badge tone={t.revoked_at ? "neutral" : "positive"}>{t.revoked_at ? "revoked" : "active"}</Badge>
            <span className="text-[12px] text-faint">{t.last_used_at ? `used ${new Date(t.last_used_at).toLocaleString()}` : "never used"}</span>
            {!t.revoked_at ? <button className={buttonClass("danger", "sm", "ml-auto")} disabled={pending} onClick={() => start(async () => { const r = await revokeScimTokenAction(t.id); if (!r.ok) setErr(r.error); router.refresh(); })}>Revoke</button> : null}
          </div>
        ))}
        {!tokens.length ? <p className="px-4 py-3 text-[13px] text-muted">No tokens yet.</p> : null}
      </Card>
      <Err e={err} />
    </div>
  );
}
