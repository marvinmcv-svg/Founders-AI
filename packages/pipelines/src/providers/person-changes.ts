/**
 * Person change feed (plan 9.3 input). Real adapters (licensed person-data change feeds, GitHub/X
 * bio changes, registry officer appointments) implement `PersonChangeFeed` — H5.
 *
 * `SyntheticPersonChangeFeed` mutates real rows of the seed universe into plausible before/after
 * snapshots, including the hard cases a real feed contains (cosmetic title edits, side projects,
 * advisory roles, consultancies, overlapping roles). Each record carries the ground-truth label
 * so the detector's precision can be measured; real feeds have `label: null`.
 */
import type { PersonSnapshot, Role, TalentSignalType } from "@founders/core/signals/talent";
import type { Rng } from "@founders/core/random";
import { pg } from "../db";

export type PersonChangeRecord = {
  personId: string;
  observedAt: Date;
  before: PersonSnapshot;
  after: PersonSnapshot;
  label: TalentSignalType | "NONE" | null;
  source: string;
};

export interface PersonChangeFeed {
  readonly name: string;
  fetch(opts: { limit: number; today: Date }): Promise<PersonChangeRecord[]>;
}

type PersonRow = { id: string; headline: string | null; seniority: string | null; department: string | null };
type RoleRow = { person_id: string; company_id: string | null; company_name: string; title: string; department: string | null; start: string | null; is_founder: boolean; founded_year: number | null; seniority: string | null };
type CompanyRow = { id: string; name: string; founded_year: number | null };

const UP: Record<string, { seniority: string; title: (d: string) => string }> = {
  IC: { seniority: "Senior IC", title: (d) => `Senior ${d === "Engineering" ? "Engineer" : `${d} Specialist`}` },
  "Senior IC": { seniority: "Manager", title: (d) => `${d} Manager` },
  Manager: { seniority: "Director", title: (d) => `Director of ${d}` },
  Director: { seniority: "VP", title: (d) => `VP ${d}` },
  VP: { seniority: "C-Level", title: (d) => (d === "Engineering" ? "CTO" : d === "Sales" ? "CRO" : d === "Finance" ? "CFO" : d === "Marketing" ? "CMO" : "COO") },
  Intern: { seniority: "IC", title: (d) => `${d} Associate` },
};

const COSMETIC: [RegExp, string][] = [
  [/^Senior /, "Sr. "],
  [/^VP /, "Vice President, "],
  [/ Manager$/, " Lead"],
  [/^Head of /, "Head of "],
];

const SIDE_PROJECTS = ["Founder, Lapacho Tech Meetup", "Co-host, Andes Builders Podcast", "Advisor", "Mentor, Startup Program", "Founder, Product Community SCZ"];
const NEW_TITLES = ["Product Manager", "Senior Engineer", "Head of Sales", "Growth Lead", "Engineering Manager", "Director of Operations", "Account Executive", "Data Scientist"];

const role = (r: RoleRow): Role => ({
  companyId: r.company_id,
  companyName: r.company_name,
  title: r.title,
  seniority: r.seniority,
  department: r.department,
  isFounder: r.is_founder,
  start: r.start,
  companyFoundedYear: r.founded_year,
});

export class SyntheticPersonChangeFeed implements PersonChangeFeed {
  readonly name = "synthetic_change_feed";
  constructor(private readonly rng: Rng) {}

  async fetch({ limit, today }: { limit: number; today: Date }): Promise<PersonChangeRecord[]> {
    const sql = pg();
    const year = today.getUTCFullYear();
    const [people, young, others, breakoutStaff] = await Promise.all([
      sql<PersonRow[]>`SELECT id, headline, seniority, department FROM people WHERE deleted_at IS NULL ORDER BY random() LIMIT ${limit}`,
      sql<CompanyRow[]>`SELECT id, name, founded_year FROM companies WHERE founded_year >= ${year - 1} AND deleted_at IS NULL ORDER BY random() LIMIT 400`,
      sql<CompanyRow[]>`SELECT id, name, founded_year FROM companies WHERE deleted_at IS NULL ORDER BY random() LIMIT 400`,
      sql<{ person_id: string }[]>`SELECT p.id AS person_id FROM people p JOIN companies c ON c.id = p.current_company_id
        WHERE (c.rank <= 1000 OR 'headcount_surge' = ANY(c.highlights)) AND p.seniority NOT IN ('Founder') ORDER BY random() LIMIT ${Math.ceil(limit * 0.08)}`,
    ]);
    const breakoutIds = new Set(breakoutStaff.map((b) => b.person_id));
    const ids = [...new Set([...people.map((p) => p.id), ...breakoutIds])];
    const [extra, roles] = await Promise.all([
      sql<PersonRow[]>`SELECT id, headline, seniority, department FROM people WHERE id = ANY(${[...breakoutIds]})`,
      sql<RoleRow[]>`SELECT pe.person_id, pe.company_id, pe.company_name, pe.title, pe.department, pe.start::text AS start, pe.is_founder,
          c.founded_year, p.seniority
        FROM person_experience pe JOIN people p ON p.id = pe.person_id LEFT JOIN companies c ON c.id = pe.company_id
        WHERE pe.is_current AND pe.person_id = ANY(${ids})`,
    ]);
    const byPerson = new Map<string, Role[]>();
    for (const r of roles) byPerson.set(r.person_id, [...(byPerson.get(r.person_id) ?? []), role(r)]);
    const all = new Map<string, PersonRow>([...people, ...extra].map((p) => [p.id, p]));

    const out: PersonChangeRecord[] = [];
    for (const p of all.values()) {
      const current = byPerson.get(p.id) ?? [];
      if (!current.length) continue;
      const before: PersonSnapshot = { headline: p.headline, current };
      const observedAt = new Date(today.getTime() - this.rng.int(0, 2) * 86_400_000 - this.rng.int(0, 80_000) * 1000);
      const dept = p.department ?? current[0]?.department ?? "Operations";
      const startDate = observedAt.toISOString().slice(0, 10);
      const rec = (label: PersonChangeRecord["label"], after: PersonSnapshot, b: PersonSnapshot = before): PersonChangeRecord => ({
        personId: p.id, observedAt, before: b, after, label, source: this.name,
      });

      if (breakoutIds.has(p.id)) {
        // Leaves a breakout company; most keep looking, some join elsewhere immediately (NEW_ROLE wins then).
        const target = this.rng.pick(others);
        if (this.rng.chance(0.7)) out.push(rec("DEPARTURE", { headline: `Formerly at ${current[0]?.companyName}`, current: [] }));
        else out.push(rec("NEW_ROLE", { headline: p.headline, current: [{ companyId: target.id, companyName: target.name, title: this.rng.pick(NEW_TITLES), seniority: "Manager", department: dept, isFounder: false, start: startDate, companyFoundedYear: target.founded_year }] }));
        continue;
      }

      const kind = this.rng.weighted(
        ["NEW_COMPANY_STEALTH", "NEW_COMPANY_LIVE", "OUT_OF_STEALTH", "NEW_ROLE", "NEW_ROLE_OVERLAP", "PROMOTION", "SEARCHING", "COSMETIC", "SIDE_PROJECT", "CONSULTANCY", "HEADLINE"],
        [9, 9, 5, 20, 3, 15, 8, 12, 8, 3, 4],
      );
      const cur = current[0] as Role;
      switch (kind) {
        case "NEW_COMPANY_STEALTH":
          out.push(rec("NEW_COMPANY", { headline: "Building something new", current: [{ companyId: null, companyName: "Stealth Startup", title: "Co-founder", seniority: "Founder", department: dept, isFounder: true, start: startDate, companyFoundedYear: null }] }));
          break;
        case "NEW_COMPANY_LIVE": {
          const c = this.rng.pick(young);
          out.push(rec("NEW_COMPANY", { headline: `Co-founder at ${c.name}`, current: [{ companyId: c.id, companyName: c.name, title: this.rng.pick(["Co-founder & CEO", "Co-founder & CTO", "Founder"]), seniority: "Founder", department: dept, isFounder: true, start: startDate, companyFoundedYear: c.founded_year }] }));
          break;
        }
        case "OUT_OF_STEALTH": {
          const c = this.rng.pick(young);
          const stealthBefore: PersonSnapshot = { headline: "Building something new", current: [{ companyId: null, companyName: "Stealth Startup", title: "Co-founder", seniority: "Founder", department: dept, isFounder: true, start: null, companyFoundedYear: null }] };
          out.push(rec("OUT_OF_STEALTH", { headline: `Co-founder at ${c.name}`, current: [{ companyId: c.id, companyName: c.name, title: "Co-founder", seniority: "Founder", department: dept, isFounder: true, start: startDate, companyFoundedYear: c.founded_year }] }, stealthBefore));
          break;
        }
        case "NEW_ROLE": {
          const c = this.rng.pick(others);
          out.push(rec("NEW_ROLE", { headline: p.headline, current: [{ companyId: c.id, companyName: c.name, title: this.rng.pick(NEW_TITLES), seniority: this.rng.pick(["IC", "Senior IC", "Manager", "Director"]), department: dept, isFounder: false, start: startDate, companyFoundedYear: c.founded_year }] }));
          break;
        }
        case "NEW_ROLE_OVERLAP": {
          // Provider keeps the old role open for a while: a real move the detector should not see yet.
          const c = this.rng.pick(others);
          out.push(rec("NEW_ROLE", { headline: p.headline, current: [...current, { companyId: c.id, companyName: c.name, title: this.rng.pick(NEW_TITLES), seniority: "Manager", department: dept, isFounder: false, start: startDate, companyFoundedYear: c.founded_year }] }));
          break;
        }
        case "PROMOTION": {
          const up = UP[cur.seniority ?? ""];
          if (!up) {
            out.push(rec("NONE", { headline: p.headline, current }));
            break;
          }
          out.push(rec("PROMOTION", { headline: p.headline, current: [{ ...cur, title: up.title(dept), seniority: up.seniority, start: startDate }, ...current.slice(1)] }));
          break;
        }
        case "SEARCHING":
          out.push(rec("SEARCHING", { headline: this.rng.pick(["Exploring what's next", "Open to new opportunities", "On sabbatical"]), current: [] }));
          break;
        case "COSMETIC": {
          const rule = COSMETIC.find(([re]) => re.test(cur.title));
          const title = rule ? cur.title.replace(rule[0], rule[1]) : `${cur.title} `;
          out.push(rec("NONE", { headline: p.headline, current: [{ ...cur, title: title.trim() }, ...current.slice(1)] }));
          break;
        }
        case "SIDE_PROJECT":
          out.push(rec("NONE", { headline: p.headline, current: [...current, { companyId: null, companyName: this.rng.pick(["Lapacho Tech Meetup", "Andes Builders", "Startup Program SCZ"]), title: this.rng.pick(SIDE_PROJECTS), seniority: null, department: null, isFounder: false, start: startDate, companyFoundedYear: year }] }));
          break;
        case "CONSULTANCY":
          // A one-person consultancy registered this year looks exactly like a new company: an honest false positive.
          out.push(rec("NONE", { headline: "Independent consultant", current: [{ companyId: null, companyName: `${cur.companyName.split(" ")[0]} Consulting`, title: "Founder", seniority: "Founder", department: dept, isFounder: true, start: startDate, companyFoundedYear: year }] }));
          break;
        case "HEADLINE":
          out.push(rec("NONE", { headline: `${p.headline ?? cur.title} | Speaker`, current }));
          break;
      }
    }
    return out;
  }
}
