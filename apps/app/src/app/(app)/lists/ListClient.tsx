"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { buttonClass } from "@founders/ui";
import { addToList, createList, deleteList, removeFromList } from "@/app/actions";

const input = "h-9 rounded-md border border-line bg-white/[0.03] px-2.5 text-[13px] text-ink outline-none focus:border-accent/50";

export function NewListForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<"COMPANY" | "PERSON" | "INVESTOR">("COMPANY");
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        start(async () => {
          const l = await createList(name.trim(), type);
          router.push(`/lists/${l.id}`);
        });
      }}
    >
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New list name" className={`${input} w-[260px]`} />
      <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className={input}>
        <option value="COMPANY">Companies</option>
        <option value="PERSON">People</option>
        <option value="INVESTOR">Investors</option>
      </select>
      <button className={buttonClass("primary", "sm")} disabled={pending || !name.trim()}>
        Create list
      </button>
    </form>
  );
}

/** CSV/paste import: match by domain (companies) or LinkedIn URL / email (people) → preview → add. */
export function ImportBox({ listId, entityType, resolve }: { listId: string; entityType: string; resolve: (lines: string[]) => Promise<{ input: string; id: string | null; name: string | null }[]> }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<{ input: string; id: string | null; name: string | null }[] | null>(null);
  const [pending, start] = useTransition();
  const hint = entityType === "COMPANY" ? "One domain or company name per line" : entityType === "PERSON" ? "One LinkedIn URL, email or name per line" : "One investor name or domain per line";
  return (
    <div className="flex flex-col gap-2">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder={hint} className="rounded-lg border border-line bg-white/[0.03] p-2.5 text-[13px] text-ink outline-none" />
      <div className="flex gap-2">
        <button
          className={buttonClass("secondary", "sm")}
          disabled={pending || !text.trim()}
          onClick={() => start(async () => setPreview(await resolve(text.split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean).slice(0, 500))))}
        >
          Preview matches
        </button>
        {preview ? (
          <button
            className={buttonClass("primary", "sm")}
            disabled={pending}
            onClick={() =>
              start(async () => {
                await addToList(listId, preview.flatMap((p) => (p.id ? [p.id] : [])));
                setPreview(null);
                setText("");
                router.refresh();
              })
            }
          >
            Add {preview.filter((p) => p.id).length} matched
          </button>
        ) : null}
      </div>
      {preview ? (
        <div className="max-h-[220px] overflow-y-auto rounded-lg border border-line p-2 text-[12.5px]">
          <p className="mb-1 text-muted">
            {preview.filter((p) => p.id).length} of {preview.length} matched
          </p>
          {preview.map((p, i) => (
            <div key={i} className="flex justify-between py-0.5">
              <span className="truncate text-muted">{p.input}</span>
              <span className={p.id ? "text-positive" : "text-faint"}>{p.name ?? "no match"}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function RemoveButton({ listId, id }: { listId: string; id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button className="text-[12px] text-muted hover:text-negative" disabled={pending} onClick={() => start(async () => { await removeFromList(listId, [id]); router.refresh(); })}>
      Remove
    </button>
  );
}

export function DeleteListButton({ listId }: { listId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      className={buttonClass("danger", "sm")}
      disabled={pending}
      onClick={() => {
        if (confirm("Delete this list? Items stay in the database.")) start(async () => { await deleteList(listId); router.push("/lists"); });
      }}
    >
      Delete list
    </button>
  );
}
