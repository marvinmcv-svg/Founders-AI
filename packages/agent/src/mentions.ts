/**
 * Composer tokens (plan 10.1): `@[Name](com_…)` mentions an entity, `#[Name](lst_…|srh_…)` a list
 * or saved search, and a leading `/slug` runs a skill. The UI inserts the bracket forms.
 */
export type Mention = { kind: "entity" | "list" | "search"; id: string; label: string };

const TOKEN = /([@#])\[([^\]]{1,120})\]\(((?:com|per|inv|lst|srh)_[a-z0-9_]{6,40})\)/g;

export function parseMentions(text: string): Mention[] {
  const out: Mention[] = [];
  for (const m of text.matchAll(TOKEN)) {
    const id = m[3]!;
    const kind = id.startsWith("lst_") ? "list" : id.startsWith("srh_") ? "search" : "entity";
    if (!out.some((o) => o.id === id)) out.push({ kind, id, label: m[2]! });
  }
  return out;
}

/** Replaces tokens with their plain labels (for titles, NL search and the model prompt). */
export function plainText(text: string): string {
  return text.replace(TOKEN, (_all, _sigil: string, label: string) => label);
}

/** `/market-map fintech in Mexico` → { slug: "market-map", rest: "fintech in Mexico" }. */
export function parseSkillCommand(text: string): { slug: string; rest: string } | null {
  const m = text.trim().match(/^\/([a-z0-9][a-z0-9-]{1,39})(?:\s+([\s\S]*))?$/);
  return m ? { slug: m[1]!, rest: (m[2] ?? "").trim() } : null;
}
