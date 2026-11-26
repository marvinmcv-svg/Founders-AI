/**
 * Integrations page mocks (plan 6.14). Fixture data from @founders/mocks; decorative, so aria-hidden.
 * Counts shown are computed from the fixtures, not coverage claims (plan 1.2).
 */
import { AppWindow, AvatarStack, Badge, Card, cn, Favicon } from "@founders/ui";
import { FIX } from "@founders/mocks";
import { usd } from "@founders/core/format";
import { t, tList } from "@/lib/copy";

const s = (v: unknown) => String(v ?? "");

export function IntegrationTiles() {
  return (
    <div aria-hidden className="grid grid-cols-3 gap-3 p-4 sm:grid-cols-4">
      {tList("integrationsPage.tiles").map((name) => (
        <div key={name} className="flex flex-col items-center gap-2 rounded-[14px] border border-line bg-sunken px-3 py-4 text-[12px] text-muted">
          <Favicon name={name} size={28} />
          {name}
        </div>
      ))}
    </div>
  );
}

export function CrmSyncMock({ className }: { className?: string }) {
  const M = (k: string) => t(`integrationsPage.crm.mock.${k}`);
  const companies = FIX.companies.slice(0, 6);
  const matched = companies.length - 1;
  return (
    <AppWindow className={className} title="app · Settings · CRM" sidebar={false}>
      <div aria-hidden className="flex flex-col gap-3 p-4 text-[12px]">
        <div className="flex items-center gap-2">
          <Favicon name="Attio" size={18} />
          <span className="text-ink">Attio</span>
          <Badge tone="positive">{M("connected")}</Badge>
          <span className="ml-auto rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-ink">✓ {M("toast")}</span>
        </div>
        <Card className="p-3">
          <p className="mb-2 text-[11px] uppercase tracking-wide text-faint">{M("pull")}</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              [M("companies"), matched, 1],
              [M("people"), FIX.people.length, 0],
            ].map(([label, n, u]) => (
              <div key={String(label)} className="rounded-lg border border-line p-2">
                <p className="text-muted">{label}</p>
                <p>
                  <b className="text-accent">{String(n)}</b> <span className="text-text">{M("matched")}</span>
                </p>
                <p className="text-faint">
                  {String(u)} {M("unmatched")}
                </p>
              </div>
            ))}
          </div>
        </Card>
        <div className="overflow-hidden rounded-[10px] border border-line">
          {companies.map((c, i) => (
            <div key={s(c.id)} className="flex items-center gap-2 border-b border-line px-3 py-2 last:border-0">
              <span className={i === companies.length - 1 ? "text-faint" : "text-positive"}>{i === companies.length - 1 ? "–" : "✓"}</span>
              <Favicon name={s(c.name)} size={16} />
              <span className="truncate text-ink">{s(c.name)}</span>
              <span className="truncate text-faint">{s(c.domain)}</span>
              {i < companies.length - 1 ? <span className="ml-auto rounded bg-accent/15 px-1 text-[10px] font-semibold text-accent">CRM</span> : null}
            </div>
          ))}
        </div>
        <Card className="flex flex-wrap items-center gap-3 p-3">
          <span className="text-[11px] uppercase tracking-wide text-faint">{M("push")}</span>
          <span className="text-muted">{M("owner")}:</span>
          <span className="text-ink">{s(FIX.people[0]?.full_name)}</span>
          <Badge tone="neutral">{M("schedule")}</Badge>
        </Card>
      </div>
    </AppWindow>
  );
}

export function NetworkMock({ className }: { className?: string }) {
  const M = (k: string) => t(`integrationsPage.network.mock.${k}`);
  const team = ["Marco", "Lucía", "Diego"];
  const people = FIX.people.slice(0, 5);
  return (
    <AppWindow className={className} title="app · Team Network" sidebar={false}>
      <div aria-hidden className="flex flex-col gap-2 p-4 text-[12px]">
        <div className="rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 text-ink">
          {s(FIX.companies[1]?.name)} {M("hired")}: {s(people[0]?.full_name)}
        </div>
        {people.map((p, i) => (
          <div key={s(p.id)} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
            <AvatarStack names={[s(p.full_name)]} size={22} />
            <span className="min-w-0 flex-1 truncate">
              <span className="text-ink">{s(p.full_name)}</span> <span className="text-muted">· {s(p.current_title)}</span>
            </span>
            <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">
              {team[i % team.length]} {M("connected")}
            </span>
            <span className={cn("h-1.5 w-10 shrink-0 rounded-full", i < 2 ? "bg-accent" : i < 4 ? "bg-accent/50" : "bg-white/20")} />
          </div>
        ))}
      </div>
    </AppWindow>
  );
}

export function BrowserCardMock({ className, linkedin = false }: { className?: string; linkedin?: boolean }) {
  const M = (k: string) => t(`integrationsPage.chrome.mock.${k}`);
  const c = FIX.profile.company;
  return (
    <div aria-hidden className={cn("overflow-hidden rounded-[18px] border border-line-strong bg-paper shadow-[var(--shadow-window)]", className)}>
      <div className="flex items-center gap-2 border-b border-line bg-sunken px-3 py-2 text-[11px] text-faint">
        <span className="flex gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        </span>
        <span className="ml-2 truncate rounded-md bg-white/[0.05] px-2 py-0.5">{linkedin ? `linkedin.com/company/${s(c.domain).split(".")[0]}` : `https://${s(c.domain)}`}</span>
      </div>
      <div className="grid grid-cols-[1fr_260px]">
        <div className="relative min-h-[260px] p-5">
          <div className="h-4 w-1/2 rounded bg-white/[0.06]" />
          <div className="mt-3 h-3 w-3/4 rounded bg-white/[0.04]" />
          <div className="mt-2 h-3 w-2/3 rounded bg-white/[0.04]" />
          {linkedin ? <span className="absolute bottom-5 right-5 rounded-full bg-accent px-3 py-1.5 text-[11px] font-semibold text-accent-ink">{M("view")}</span> : null}
        </div>
        <div className="flex flex-col gap-2 border-l border-line p-3 text-[11.5px]">
          <div className="flex items-center gap-2">
            <Favicon name={s(c.name)} size={20} />
            <b className="text-ink">{s(c.name)}</b>
          </div>
          <p className="line-clamp-2 text-muted">{s(c.tagline)}</p>
          <div className="flex flex-wrap gap-1">
            {[s(c.hq_country), s(c.growth_stage), ...((c.business_models as string[] | undefined) ?? []).slice(0, 1)].filter(Boolean).map((x) => (
              <span key={x} className="rounded-full border border-line px-1.5 text-faint">
                {x}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <div className="rounded-md border border-line p-1.5">
              <span className="text-faint">{M("team")}</span>
              <b className="block text-ink">{s(c.employee_count)}</b>
            </div>
            <div className="rounded-md border border-line p-1.5">
              <span className="text-faint">{M("raised")}</span>
              <b className="block text-ink">{usd(Number(c.total_funding_usd))}</b>
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            <span className="rounded-md bg-accent px-2 py-1 font-semibold text-accent-ink">{M("push")}</span>
            <span className="rounded-md border border-line px-2 py-1 text-text">{M("list")}</span>
            <span className="rounded-md border border-line px-2 py-1 text-text">{M("like")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
