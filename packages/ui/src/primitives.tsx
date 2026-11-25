import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ComponentProps, ReactNode } from "react";
import { initials } from "@founders/core/format";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ---------------- Button ---------------- */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "link" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap select-none",
    variant !== "link" && "rounded-full",
    size === "sm" && variant !== "link" && "h-8 px-3 text-[13px]",
    size === "md" && variant !== "link" && "h-10 px-5 text-sm",
    size === "lg" && variant !== "link" && "h-12 px-6 text-[15px]",
    variant === "primary" && "bg-accent text-accent-ink hover:bg-[#e6ff7a]",
    variant === "secondary" && "border border-line-strong bg-white/[0.03] text-ink hover:bg-white/[0.08]",
    variant === "ghost" && "text-text hover:bg-white/[0.06] hover:text-ink",
    variant === "danger" && "border border-negative/40 text-negative hover:bg-negative/10",
    variant === "link" && "text-accent hover:underline underline-offset-4 text-sm",
    className,
  );
}

type ButtonProps = { variant?: ButtonVariant; size?: ButtonSize } & (
  | ({ href: string } & ComponentProps<"a">)
  | ({ href?: undefined } & ComponentProps<"button">)
);

export function Button({ variant = "primary", size = "md", className, ...rest }: ButtonProps) {
  if ("href" in rest && rest.href !== undefined) {
    const { href, ...a } = rest as ComponentProps<"a"> & { href: string };
    return <a href={href} className={buttonClass(variant, size, className)} {...a} />;
  }
  const b = rest as ComponentProps<"button">;
  return <button type={b.type ?? "button"} className={buttonClass(variant, size, className)} {...b} />;
}

/* ---------------- Badges, chips, eyebrows ---------------- */

export function Badge({ children, tone = "accent", className }: { children: ReactNode; tone?: "accent" | "neutral" | "positive" | "negative" | "info" | "warning"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-4",
        tone === "accent" && "bg-accent text-accent-ink",
        tone === "neutral" && "bg-white/[0.07] text-text",
        tone === "positive" && "bg-positive/15 text-positive",
        tone === "negative" && "bg-negative/15 text-negative",
        tone === "info" && "bg-info/15 text-info",
        tone === "warning" && "bg-warning/15 text-warning",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Chip({ children, active, className, onRemove, ...rest }: { children: ReactNode; active?: boolean; onRemove?: () => void } & ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[6px] border px-2 py-1 text-[12px] leading-4",
        active ? "border-accent/40 bg-accent-soft text-ink" : "border-line bg-white/[0.03] text-text",
        className,
      )}
      {...rest}
    >
      {children}
      {onRemove ? (
        <button type="button" onClick={onRemove} className="-mr-0.5 rounded text-muted hover:text-ink" aria-label="Remove">
          ×
        </button>
      ) : null}
    </span>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("inline-flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.14em] text-accent", className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
      {children}
    </p>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  lede,
  action,
  align = "left",
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  action?: ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4", align === "center" && "items-center text-center", className)}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2 className="max-w-3xl text-balance text-[34px] font-semibold leading-[1.08] md:text-[46px]">{title}</h2>
      {lede ? <p className="max-w-2xl text-pretty text-[16px] leading-relaxed text-muted md:text-[17px]">{lede}</p> : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}

export function Card({ children, className, ...rest }: { children: ReactNode } & ComponentProps<"div">) {
  return (
    <div className={cn("rounded-[12px] border border-line bg-paper", className)} {...rest}>
      {children}
    </div>
  );
}

export function FeatureCard({ title, body, icon, link, className }: { title: ReactNode; body: ReactNode; icon?: ReactNode; link?: ReactNode; className?: string }) {
  return (
    <Card className={cn("flex flex-col gap-3 p-6", className)}>
      {icon ? <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">{icon}</div> : null}
      <h3 className="text-[18px] font-semibold leading-snug">{title}</h3>
      <p className="text-[14px] leading-relaxed text-muted">{body}</p>
      {link ? <div className="mt-auto pt-2">{link}</div> : null}
    </Card>
  );
}

/* ---------------- Brand mark ---------------- */

export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#0a0a0a" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="7.5" fill="none" stroke="rgba(255,255,255,0.12)" />
      <path d="M10 8h11v3.4h-7.2v3.3h6.4v3.3h-6.4V24H10z" fill="#d8ff4a" />
      <circle cx="23" cy="21.6" r="2.4" fill="#d8ff4a" />
    </svg>
  );
}

export function Wordmark({ name = "Founders", suffix = "AI", className }: { name?: string; suffix?: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="font-display text-[15px] font-medium uppercase tracking-[0.32em] text-ink">
        {name}
        {suffix ? <span className="ml-2 tracking-[0.1em] text-accent">{suffix}</span> : null}
      </span>
    </span>
  );
}

/* ---------------- Avatars & favicons ---------------- */

const HUES = [72, 150, 200, 260, 320, 20, 45, 180];
function hueFor(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return HUES[h % HUES.length] ?? 72;
}

/** Generated square "favicon" for synthetic companies (never a real logo). */
export function Favicon({ name, size = 20, className }: { name: string; size?: number; className?: string }) {
  const hue = hueFor(name);
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-[5px] font-display font-semibold", className)}
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.5), background: `hsl(${hue} 70% 18%)`, color: `hsl(${hue} 90% 72%)` }}
    >
      {name.replace(/[^A-Za-zÀ-ÿ]/g, "").charAt(0).toUpperCase() || "•"}
    </span>
  );
}

/** Initials avatar (no photos of real people — plan 6 "Mock" rule). */
export function Avatar({ name, size = 28, className }: { name: string; size?: number; className?: string }) {
  const hue = hueFor(name);
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-medium ring-2 ring-canvas", className)}
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.38), background: `hsl(${hue} 35% 24%)`, color: `hsl(${hue} 80% 85%)` }}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({ names, size = 24, max = 3 }: { names: string[]; size?: number; max?: number }) {
  const shown = names.slice(0, max);
  return (
    <span className="inline-flex items-center">
      {shown.map((n, i) => (
        <Avatar key={`${n}-${i}`} name={n} size={size} className={i ? "-ml-2" : ""} />
      ))}
      {names.length > max ? <span className="ml-1.5 text-[12px] text-muted">+{names.length - max}</span> : null}
    </span>
  );
}

/* ---------------- Numbers ---------------- */

export function Delta({ value, className }: { value: number | null | undefined; className?: string }) {
  if (value === null || value === undefined || Number.isNaN(value)) return <span className={cn("text-faint", className)}>—</span>;
  const pct = Math.round(value * 1000) / 10;
  return (
    <span className={cn("tabular", pct > 0 ? "text-positive" : pct < 0 ? "text-negative" : "text-muted", className)}>
      {pct > 0 ? "+" : ""}
      {pct}%
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-white/[0.04] px-1.5 py-0.5 font-mono text-[11px] text-muted">{children}</kbd>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-white/[0.06]", className)} />;
}

export function EmptyState({ title, body, action, icon }: { title: ReactNode; body?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-[12px] border border-dashed border-line px-6 py-16 text-center">
      {icon ? <div className="text-faint">{icon}</div> : null}
      <p className="font-display text-[17px] text-ink">{title}</p>
      {body ? <p className="max-w-md text-sm text-muted">{body}</p> : null}
      {action}
    </div>
  );
}

export function LiveDot({ className }: { className?: string }) {
  return <span className={cn("inline-block h-2 w-2 animate-pulse-dot rounded-full bg-accent", className)} aria-hidden />;
}
