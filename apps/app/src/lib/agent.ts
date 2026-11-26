import "server-only";
import { CURATED_SKILLS } from "@founders/agent";
import * as repo from "@founders/core/repo";

/** Options for the composer: skills (workspace first, then curated), lists and saved searches. */
export async function composerOptions(ctx: repo.OrgContext) {
  const [own, lists, searches] = await Promise.all([repo.listSkills(ctx), repo.getLists(ctx), repo.getSavedSearches(ctx)]);
  const ownSlugs = new Set(own.filter((s) => s.status === "SAVED").map((s) => s.slug));
  return {
    skills: [
      ...own.filter((s) => s.status === "SAVED").map((s) => ({ slug: s.slug, name: s.name, description: s.description })),
      ...CURATED_SKILLS.filter((s) => !ownSlugs.has(s.slug)).map((s) => ({ slug: s.slug, name: s.name, description: s.description })),
    ],
    lists: lists.map((l) => ({ id: l.id, name: l.name })),
    searches: searches.map((s) => ({ id: s.id, name: s.name })),
  };
}
