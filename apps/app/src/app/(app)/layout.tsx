import type { ReactNode } from "react";
import * as repo from "@founders/core/repo";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { Sidebar } from "@/components/shell/Sidebar";
import { MobileNav } from "@/components/shell/MobileNav";
import { getCtx } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await getCtx();
  const [lists, searches, notifications, unread] = await Promise.all([
    repo.getLists(ctx),
    repo.getSavedSearches(ctx),
    repo.getNotifications(ctx, 10),
    repo.unreadNotificationCount(ctx),
  ]);
  return (
    <div className="flex min-h-screen">
      <Sidebar
        orgName={ctx.orgName}
        orgs={ctx.orgs}
        activeOrgId={ctx.orgId}
        userName={ctx.userName}
        email={ctx.email}
        searchCount={searches.length}
        newResults={searches.reduce((a, s) => a + (s.new_results ?? 0), 0)}
        lists={lists.map((l) => ({ id: l.id, name: l.name, system: l.system, entity_type: l.entity_type }))}
        notifications={notifications}
        unread={unread}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav />
        {children}
      </div>
      <CommandPalette />
    </div>
  );
}
