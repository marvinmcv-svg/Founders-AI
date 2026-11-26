/**
 * Open roles from the ATS (plan 6.17). Reads Ashby's public job board when ASHBY_JOB_BOARD is set;
 * BLOCKED-HUMAN until the owner creates the ATS account. Never invents roles: no board, no roles.
 */
export type Role = { id: string; title: string; team: string; location: string; url: string };

type AshbyJob = { id?: string; title?: string; department?: string; team?: string; location?: string; jobUrl?: string; isListed?: boolean };

export async function openRoles(): Promise<Role[]> {
  const board = process.env.ASHBY_JOB_BOARD;
  if (!board) return [];
  try {
    const r = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}`, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(5000) });
    if (!r.ok) return [];
    const d = (await r.json()) as { jobs?: AshbyJob[] };
    return (d.jobs ?? [])
      .filter((j) => j.isListed !== false && j.title && j.jobUrl)
      .map((j) => ({ id: String(j.id ?? j.jobUrl), title: String(j.title), team: String(j.team ?? j.department ?? ""), location: String(j.location ?? ""), url: String(j.jobUrl) }));
  } catch {
    return [];
  }
}
