"use client";
import { useState } from "react";
import { Button } from "@founders/ui";

/** Copy (memo/email) and download (CSV) for an artifact. Chips `[[id]]` are stripped when copying. */
export function ArtifactActions({ kind, title, text }: { kind: string; title: string; text: string }) {
  const [copied, setCopied] = useState(false);
  if (kind === "chart") return null;
  if (kind === "csv") {
    return (
      <Button
        size="sm"
        onClick={() => {
          const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
          const link = document.createElement("a");
          link.href = url;
          link.download = `${title.replace(/[^\w-]+/g, "_").slice(0, 60)}.csv`;
          link.click();
          URL.revokeObjectURL(url);
        }}
      >
        Download CSV
      </Button>
    );
  }
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={async () => {
        await navigator.clipboard.writeText(text.replace(/\s?\[\[[^\]]+\]\]/g, ""));
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}
