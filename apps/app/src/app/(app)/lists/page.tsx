import type { Metadata } from "next";
import Link from "next/link";
import * as repo from "@founders/core/repo";
import { Badge, Card } from "@founders/ui";
import { getCtx } from "@/lib/session";
import { NewListForm } from "./ListClient";

export const metadata: Metadata = { title: "Lists" };

export default async function Lists() {
  const ctx = await getCtx();
  const lists = await repo.getLists(ctx);
  return (
    <div className="p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold">Lists</h1>
          <p className="text-[13px] text-muted">Shared or private lists of companies, people and investors.</p>
        </div>
      </div>
      <NewListForm />
      <Card className="mt-5 overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-faint">
              <th className="px-4 py-2.5 font-medium">List</th>
              <th className="px-4 py-2.5 font-medium">Type</th>
              <th className="px-4 py-2.5 text-right font-medium">Items</th>
              <th className="px-4 py-2.5 font-medium">Visibility</th>
              <th className="px-4 py-2.5 font-medium">Owner</th>
              <th className="px-4 py-2.5 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {lists.map((l) => (
              <tr key={l.id} className="border-b border-line/60 hover:bg-white/[0.02]">
                <td className="px-4 py-3">
                  <Link href={`/lists/${l.id}`} className="text-ink hover:text-accent">
                    {l.name}
                  </Link>{" "}
                  {l.system ? <Badge tone="neutral">System</Badge> : null}
                </td>
                <td className="px-4 py-3 capitalize text-muted">{l.entity_type.toLowerCase()}</td>
                <td className="px-4 py-3 text-right tabular">{l.item_count.toLocaleString()}</td>
                <td className="px-4 py-3 text-muted">{l.visibility === "TEAM" ? "Team" : "Private"}</td>
                <td className="px-4 py-3 text-muted">{l.owner_name}</td>
                <td className="px-4 py-3 text-muted">{new Date(l.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
