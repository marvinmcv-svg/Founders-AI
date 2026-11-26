import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { int, shortDate } from "@founders/core/format";
import * as repo from "@founders/core/repo";
import { Avatar, Badge, Chip, Favicon, SIGNAL_LABEL } from "@founders/ui";
import { Notes, ProfileActions, RevealEmail } from "@/components/profile/Actions";
import { Empty, Metric, Panel } from "@/components/profile/bits";
import { getCtx } from "@/lib/session";
import { CrmProfileCard } from "@/components/integrations/CrmBadge";

type P = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const p = await repo.getPerson((await params).id);
  return { title: p ? String(p.full_name) : "Person" };
}

const years = (start: unknown, end: unknown) => {
  const s = start ? new Date(String(start)).getTime() : null;
  const e = end ? new Date(String(end)).getTime() : Date.now();
  if (!s) return "";
  const m = Math.max(1, Math.round((e - s) / (30 * 86_400_000)));
  return m >= 12 ? `${Math.floor(m / 12)}y ${m % 12}m` : `${m}m`;
};

export default async function PersonProfile({ params }: P) {
  const { id } = await params;
  const ctx = await getCtx();
  const [crmBadges, crmTarget] = await Promise.all([repo.getCrmBadges(ctx, [id]), repo.defaultCrm(ctx)]);
  const p = await repo.getPerson(id);
  if (!p) notFound();
  const [exp, edu, signals, investments, statuses, entityStatus, liked, inLists, notes] = await Promise.all([
    repo.getPersonExperience(id),
    repo.getPersonEducation(id),
    repo.getPersonTalentSignals(id),
    repo.getPersonInvestments(id),
    repo.getStatuses(ctx),
    repo.getEntityStatuses(ctx, [id]),
    repo.isLiked(ctx, id),
    repo.getListsContaining(ctx, id),
    repo.getNotes(ctx, id),
  ]);
  const highlights = Array.isArray(p.highlights) ? (p.highlights as string[]) : [];
  return (
    <div className="min-w-0">
      <header className="flex flex-col gap-4 border-b border-line px-6 pb-5 pt-6">
        <div className="text-[12px] text-muted">
          <Link href="/people" className="hover:text-ink">
            People
          </Link>{" "}
          / {String(p.full_name)}
        </div>
        <div className="flex flex-wrap items-start gap-4">
          <Avatar name={String(p.full_name)} size={60} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[26px] font-semibold">{String(p.full_name)}</h1>
              <Badge tone="neutral">Synthetic demo data</Badge>
            </div>
            <p className="mt-1 text-[14px] text-muted">{String(p.headline ?? "")}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Chip>{String(p.location ?? "")}</Chip>
              <Chip>{String(p.seniority ?? "")}</Chip>
              {p.current_company_id ? (
                <Link href={`/companies/${String(p.current_company_id)}`}>
                  <Chip className="hover:border-accent/40">
                    <Favicon name={String(p.current_company_name)} size={14} /> {String(p.current_company_name)}
                  </Chip>
                </Link>
              ) : null}
            </div>
          </div>
          <RevealEmail personId={id} />
        </div>
        <ProfileActions entityName={String(p.full_name)} entityType="PERSON" id={id} liked={liked} status={entityStatus[id] ?? null} statuses={statuses} inLists={inLists} />
        <CrmProfileCard kind="PERSON" id={id} badge={crmBadges[id] ?? null} target={crmTarget} canWrite={repo.canWrite(ctx)} />
      </header>
      <div className="grid gap-4 p-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            <Metric label="Connections" value={int(Number(p.connections))} />
            <Metric label="Followers" value={int(Number(p.followers))} />
            <Metric label="Experience" value={`${String(p.years_experience ?? "—")} yrs`} />
          </div>
          <p className="text-[14px] leading-relaxed text-text">{String(p.bio ?? "")}</p>
          {highlights.length ? (
            <div className="flex flex-wrap gap-1.5">
              {highlights.map((h) => (
                <Chip key={h} active>
                  {h}
                </Chip>
              ))}
            </div>
          ) : null}
          <Panel title="Talent signals">
            {signals.map((s) => (
              <div key={String(s.id)} className="mb-2 rounded-lg border border-accent/25 bg-accent-soft/50 p-3 text-[13px] last:mb-0">
                <div className="flex items-center gap-2 text-[12px]">
                  <Badge>{SIGNAL_LABEL[String(s.type)] ?? String(s.type)}</Badge>
                  <span className="text-muted">{shortDate(String(s.signal_date))}</span>
                  <span className="ml-auto font-display text-accent">{String(s.score)}/10</span>
                </div>
                <p className="mt-1.5 text-text">{String(s.summary)}</p>
              </div>
            ))}
            {!signals.length ? <Empty>No talent signals.</Empty> : null}
          </Panel>
          <Panel title="Experience">
            <ol className="flex flex-col">
              {exp.map((e) => (
                <li key={String(e.id)} className="flex gap-3 border-b border-line/60 py-3 last:border-0">
                  <Favicon name={String(e.company_name)} size={30} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] text-ink">
                      {String(e.title)} {e.is_founder ? <Badge tone="neutral">Founder</Badge> : null}
                    </p>
                    <p className="text-[12.5px] text-muted">
                      {e.company_id ? (
                        <Link href={`/companies/${String(e.company_id)}`} className="hover:text-ink hover:underline">
                          {String(e.company_name)}
                        </Link>
                      ) : (
                        String(e.company_name)
                      )}{" "}
                      · {shortDate(e.start as string | null)} – {e.is_current ? "present" : shortDate(e.end as string | null)} · {years(e.start, e.end)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
        <div className="flex flex-col gap-4">
          <Panel title="Education">
            {edu.map((e) => (
              <div key={String(e.school_id)} className="py-1.5 text-[13px]">
                <p className="text-ink">
                  {String(e.school_name)} {Number(e.tier) === 1 ? <Badge tone="neutral">Top university</Badge> : null}
                </p>
                <p className="text-muted">
                  {String(e.degree ?? "")}, {String(e.field ?? "")} · {String(e.end ?? "")}
                </p>
              </div>
            ))}
            {!edu.length ? <Empty>No education on file.</Empty> : null}
          </Panel>
          <Panel title="Investment activity">
            {investments.length ? (
              investments.map((i) => (
                <Link key={String(i.id)} href={`/companies/${String(i.company_id)}`} className="flex justify-between py-1.5 text-[13px] hover:text-accent">
                  <span>{String(i.company_name)}</span>
                  <span className="text-muted">{String(i.type)}</span>
                </Link>
              ))
            ) : (
              <Empty>No angel investments on record.</Empty>
            )}
          </Panel>
          <Panel title="Team notes">
            <Notes entityType="PERSON" id={id} notes={notes} />
          </Panel>
          <p className="text-[11.5px] text-faint">
            People data is processed under legitimate interest; anyone can request removal at the privacy-rights page. Email reveals are logged.
          </p>
        </div>
      </div>
    </div>
  );
}
