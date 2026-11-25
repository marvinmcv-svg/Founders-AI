import { readFileSync } from "node:fs";
import path from "node:path";
import { brand } from "@founders/config";
import { t } from "@/lib/copy";

/** Renders /content/legal/<name>.md (tiny markdown subset: #, ##, paragraphs). */
export function LegalDoc({ name, id }: { name: string; id: string }) {
  const file = path.join(process.cwd(), "..", "..", "content", "legal", `${name}.md`);
  const raw = readFileSync(file, "utf8").replace(/\{brand\}/g, brand.name).replace(/\{entity\}/g, brand.legalEntity).replace(/\{domain\}/g, brand.domain);
  const blocks = raw.split(/\n\s*\n/);
  return (
    <article data-section={id} className="mx-auto max-w-3xl px-5 py-16">
      <p className="mb-6 rounded-lg border border-warning/30 bg-warning/10 px-4 py-2 text-[13px] text-warning">{t("legal.draftNotice")}</p>
      {blocks.map((b, i) =>
        b.startsWith("# ") ? (
          <h1 key={i} className="mb-6 text-[44px] font-semibold">{b.slice(2)}</h1>
        ) : b.startsWith("## ") ? (
          <h2 key={i} className="mb-2 mt-8 text-[22px] font-semibold">{b.slice(3)}</h2>
        ) : (
          <p key={i} className="mb-3 text-[15px] leading-relaxed text-muted">{b}</p>
        ),
      )}
    </article>
  );
}
