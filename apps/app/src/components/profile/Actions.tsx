"use client";
/** Profile action bar islands: Add to List, Like, Hide, Status, Share; Notes; Email reveal. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, EyeOff, Heart, Link2, Mail, Plus, Sparkles } from "lucide-react";
import { CREDIT_PRICES } from "@founders/core/pricing";
import { buttonClass, cn } from "@founders/ui";
import { addNote, addToList, createList, getMyLists, revealEmail, setStatus, toggleHide, toggleLike } from "@/app/actions";

type EntityType = "COMPANY" | "PERSON" | "INVESTOR";

export function ProfileActions({ entityType, id, entityName, liked: likedInit, status, statuses, inLists }: { entityType: EntityType; id: string; entityName?: string; liked: boolean; status: { id: string; label: string; color: string } | null; statuses: { id: string; label: string; color: string }[]; inLists: { id: string; name: string }[] }) {
  const router = useRouter();
  const [liked, setLiked] = useState(likedInit);
  const [st, setSt] = useState(status);
  const [open, setOpen] = useState<null | "list" | "status">(null);
  const [lists, setLists] = useState<{ id: string; name: string }[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [, start] = useTransition();
  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 2500);
  };
  return (
    <div className="relative flex flex-wrap items-center gap-2">
      <button
        className={buttonClass("primary", "sm")}
        onClick={async () => {
          setOpen(open === "list" ? null : "list");
          if (!lists) setLists((await getMyLists(entityType)).map((l) => ({ id: l.id, name: l.name })));
        }}
      >
        <Plus size={14} /> Add to List
      </button>
      {entityName ? (
        <Link href={`/agent?entity=${id}&name=${encodeURIComponent(entityName)}`} className={buttonClass("secondary", "sm")}>
          <Sparkles size={14} /> Ask agent
        </Link>
      ) : null}
      <button className={buttonClass("secondary", "sm")} onClick={() => setOpen(open === "status" ? null : "status")}>
        <span className="h-2 w-2 rounded-full" style={{ background: st?.color ?? "#6b6b6b" }} />
        {st?.label ?? "Set status"}
      </button>
      <button className={buttonClass("ghost", "sm", liked ? "text-accent" : "")} aria-pressed={liked} onClick={() => start(async () => setLiked(await toggleLike(entityType, id)))}>
        <Heart size={14} fill={liked ? "currentColor" : "none"} /> {liked ? "Liked" : "Like"}
      </button>
      <button className={buttonClass("ghost", "sm")} onClick={() => start(async () => flash((await toggleHide(entityType, id)) ? "Hidden from your results" : "Unhidden"))}>
        <EyeOff size={14} /> Hide
      </button>
      <button
        className={buttonClass("ghost", "sm")}
        onClick={() => {
          void navigator.clipboard?.writeText(window.location.href);
          flash("Link copied");
        }}
      >
        <Link2 size={14} /> Share
      </button>
      {inLists.length ? <span className="text-[12px] text-muted">In {inLists.map((l) => l.name).join(", ")}</span> : null}
      {msg ? <span className="text-[12px] text-accent">{msg}</span> : null}

      {open ? <div className="fixed inset-0 z-40" onClick={() => setOpen(null)} /> : null}
      {open === "list" ? (
        <div className="absolute left-0 top-10 z-50 w-[280px] rounded-xl border border-line-strong bg-paper p-2 shadow-[var(--shadow-window)]">
          {(lists ?? []).map((l) => (
            <button
              key={l.id}
              className="block w-full rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-white/[0.05]"
              onClick={() =>
                start(async () => {
                  await addToList(l.id, [id]);
                  setOpen(null);
                  flash(`Added to ${l.name}`);
                  router.refresh();
                })
              }
            >
              {l.name}
            </button>
          ))}
          {lists === null ? <p className="px-2 py-2 text-[12px] text-muted">Loading…</p> : null}
          <form
            className="mt-1 flex gap-1 border-t border-line pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              start(async () => {
                await createList(name.trim(), entityType, [id]);
                setOpen(null);
                flash(`Created ${name.trim()}`);
                router.refresh();
              });
            }}
          >
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New list" className="h-8 flex-1 rounded-md border border-line bg-white/[0.03] px-2 text-[12.5px] text-ink outline-none" />
            <button className={buttonClass("primary", "sm")}>Add</button>
          </form>
        </div>
      ) : null}
      {open === "status" ? (
        <div className="absolute left-28 top-10 z-50 w-[200px] rounded-xl border border-line-strong bg-paper p-1.5 shadow-[var(--shadow-window)]">
          {[...statuses, { id: "", label: "Clear", color: "#6b6b6b" }].map((s) => (
            <button
              key={s.id || "clear"}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-white/[0.05]"
              onClick={() =>
                start(async () => {
                  await setStatus(entityType, [id], s.id || null);
                  setSt(s.id ? s : null);
                  setOpen(null);
                })
              }
            >
              <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
              {s.label}
              {st?.id === s.id ? <Check size={13} className="ml-auto text-accent" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Notes({ entityType, id, notes }: { entityType: EntityType; id: string; notes: { id: string; body: string; author_name: string; created_at: string }[] }) {
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            await addNote(entityType, id, body);
            setBody("");
          });
        }}
        className="flex flex-col gap-2"
      >
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Add a note for your team…" className="rounded-lg border border-line bg-white/[0.03] p-2.5 text-[13px] text-ink outline-none focus:border-accent/50" />
        <button className={buttonClass("secondary", "sm", "self-end")} disabled={pending || !body.trim()}>
          Save note
        </button>
      </form>
      {notes.map((n) => (
        <div key={n.id} className="rounded-lg border border-line p-3 text-[13px]">
          <p className="whitespace-pre-wrap text-text">{n.body}</p>
          <p className="mt-1 text-[11px] text-faint">
            {n.author_name} · {new Date(n.created_at).toLocaleDateString()}
          </p>
        </div>
      ))}
    </div>
  );
}

/** Get Email — shows the cost before confirming and the balance after (plan 7.1b). */
export function RevealEmail({ personId }: { personId: string }) {
  const [state, setState] = useState<"idle" | "confirm" | "busy" | "done">("idle");
  const [res, setRes] = useState<Awaited<ReturnType<typeof revealEmail>> | null>(null);
  if (state === "done" && res)
    return (
      <div className="flex flex-col gap-1 text-[13px]">
        {"error" in res && res.error ? <span className="text-negative">{res.error}</span> : null}
        {res.emails.length === 0 && !("error" in res && res.error) ? <span className="text-muted">No email on file — not charged.</span> : null}
        {res.emails.map((e) => (
          <span key={e.email} className="flex items-center gap-2">
            <Mail size={13} className="text-accent" />
            <a href={`mailto:${e.email}`} className="text-ink hover:underline">
              {e.email}
            </a>
            <span className={cn("rounded-full px-1.5 text-[10px]", e.status === "verified" ? "bg-positive/15 text-positive" : "bg-white/10 text-muted")}>{e.status}</span>
          </span>
        ))}
        <span className="text-[11px] text-faint">
          Charged {res.charged} · {res.remaining.toLocaleString()} credits left
        </span>
      </div>
    );
  if (state === "confirm")
    return (
      <div className="flex items-center gap-2 text-[12.5px]">
        <span className="text-muted">Costs {CREDIT_PRICES["person.email"]} credits if found.</span>
        <button
          className={buttonClass("primary", "sm")}
          onClick={async () => {
            setState("busy");
            setRes(await revealEmail(personId));
            setState("done");
          }}
        >
          Reveal
        </button>
        <button className={buttonClass("ghost", "sm")} onClick={() => setState("idle")}>
          Cancel
        </button>
      </div>
    );
  return (
    <button className={buttonClass("primary", "sm")} onClick={() => setState("confirm")} disabled={state === "busy"}>
      <Mail size={14} /> Get Email
    </button>
  );
}
