import Link from "next/link";
import { AvatarStack } from "@founders/ui";

const label = (s: number) => (s >= 60 ? "strong" : s >= 30 ? "medium" : "weak");

/** Profile header: "3 team connections" (company) or "Ana is connected · strong" (person). Plan 7.6 / 7.7. */
export function TeamConnections({ kind, rows }: { kind: "COMPANY" | "PERSON"; rows: { user_name: string; strength: number; person?: string }[] }) {
  if (!rows.length) return <span className="text-[12px] text-faint">No team connections · <Link href="/network?tab=sources" className="hover:text-accent">connect your network</Link></span>;
  const users = [...new Set(rows.map((r) => r.user_name))];
  const best = rows[0] as { user_name: string; strength: number; person?: string };
  return (
    <span className="flex items-center gap-2 text-[12px] text-muted" title={rows.slice(0, 8).map((r) => `${r.user_name}${r.person ? ` → ${r.person}` : ""} (${label(r.strength)})`).join("\n")}>
      <AvatarStack names={users} size={22} />
      {kind === "COMPANY"
        ? `${rows.length} team connection${rows.length === 1 ? "" : "s"} · best via ${best.user_name} (${label(best.strength)})`
        : `${users.slice(0, 2).join(" and ")}${users.length > 2 ? ` +${users.length - 2}` : ""} ${users.length === 1 ? "is" : "are"} connected · ${label(best.strength)}`}
    </span>
  );
}
