"use client";
import { useState } from "react";
import { Card } from "@founders/ui";
import { Tabs } from "@founders/ui/code";

export function DataTabs({ tabs }: { tabs: { id: string; label: string; body: string }[] }) {
  const [v, setV] = useState(tabs[0]?.id ?? "");
  const cur = tabs.find((x) => x.id === v);
  return (
    <Card className="p-2">
      <Tabs tabs={tabs.map((x) => ({ id: x.id, label: x.label }))} value={v} onChange={setV} variant="pill" />
      <p className="px-3 pb-3 pt-4 text-[16px] text-text">{cur?.body}</p>
    </Card>
  );
}
