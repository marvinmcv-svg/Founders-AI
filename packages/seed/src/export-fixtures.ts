/**
 * Exports marketing-mock fixtures (plan 6 "Mock" rule: real UI components + fictional fixture data)
 * from the synthetic seed DB into packages/mocks/src/fixtures.json. Re-run after changing the seed.
 */
import "@founders/db/env";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { emptyFilter } from "@founders/core/filters";
import {
  getCompany, getCompanyCompetitors, getCompanyEstimates, getCompanyNews, getCompanyRounds, getCompanyMetrics,
  getPerson, getPersonExperience, getPersonTalentSignals, rawQuery, searchEntities,
} from "@founders/core/repo";
import { sql } from "drizzle-orm";

const here = path.dirname(fileURLToPath(import.meta.url));
const seedStage = { kind: "group" as const, op: "AND" as const, children: [
  { kind: "condition" as const, field: "growth_stage", operator: "any_of" as const, value: ["Pre-seed / Seed"] },
  { kind: "condition" as const, field: "hq_region", operator: "any_of" as const, value: ["Latin America"] },
] };
const companies = (await searchEntities("companies", { filter: seedStage, limit: 14 })).rows;
const growth = (await searchEntities("companies", { filter: emptyFilter(), sort: { field: "headcount_growth_3m", dir: "desc" }, limit: 10, q: null })).rows;
const people = (await searchEntities("people", { filter: { kind: "group", op: "AND", children: [{ kind: "condition", field: "seniority", operator: "any_of", value: ["Founder"] }, { kind: "condition", field: "highlights", operator: "exists" }] }, limit: 10 })).rows;
const investors = (await searchEntities("investors", { filter: emptyFilter(), limit: 10 })).rows;
const rounds = (await searchEntities("funding_rounds", { filter: emptyFilter(), limit: 10 })).rows;
const talent = (await searchEntities("talent_signals", { filter: { kind: "group", op: "AND", children: [{ kind: "condition", field: "score", operator: "gte", value: 7 }] }, limit: 12 })).rows;
const [profileId] = await rawQuery<{ id: string }>(sql`SELECT c.id FROM companies c JOIN revenue_disclosures d ON d.company_id = c.id
  WHERE c.growth_stage = 'Growth' AND c.hq_region = 'Latin America' ORDER BY c.rank LIMIT 1`);
const pid = profileId?.id ?? String(companies[0]?.id);
const profile = {
  company: await getCompany(pid),
  estimates: await getCompanyEstimates(pid),
  competitors: await getCompanyCompetitors(pid, 8),
  news: await getCompanyNews(pid, 6),
  rounds: await getCompanyRounds(pid),
  metrics: await getCompanyMetrics(pid),
};
const founderId = String(people[0]?.id);
const person = { person: await getPerson(founderId), experience: await getPersonExperience(founderId), signals: await getPersonTalentSignals(founderId) };

const strip = (o: unknown) => JSON.parse(JSON.stringify(o, (k, v) => (k === "embedding" || k === "provenance" ? undefined : v)));
writeFileSync(path.resolve(here, "../../mocks/src/fixtures.json"), JSON.stringify(strip({ companies, growth, people, investors, rounds, talent, profile, person }), null, 1));
console.log("✓ fixtures written");
process.exit(0);
