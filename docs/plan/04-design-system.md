## 4. DESIGN SYSTEM

### 4.1 Tokens (`packages/ui/tokens.css`)

```css
:root{
  --color-primary:#4A62FF;      /* brand blue (CTA accents, highlights, links on dark) */
  --color-accent:#4459E8;       /* links, active tab underline */
  --color-bg:#F9FAFA;           /* page background */
  --color-surface:#FFFFFF;      /* cards, tables, mock windows */
  --color-ink:#19191A;          /* headings, inputs */
  --color-text:#3F3F46;         /* body */
  --color-muted:#71717A;        /* secondary text, timestamps */
  --color-border:#E4E4E7;       /* hairlines */
  --color-border-strong:#D1D4DA;/* secondary button border */
  --color-positive:#16A34A;     /* +80% growth */
  --color-negative:#DC2626;
  --color-black:#000000;        /* primary button */
  --radius-card:8px; --radius-pill:9999px; --radius-chip:6px;
  --space:4px;                  /* base unit; use multiples */
  --font-body:"Geist",Inter,ui-sans-serif,system-ui,sans-serif;
  --font-heading:"Inter Tight","Geist",Inter,ui-sans-serif,system-ui,sans-serif;
  --font-mono:"Geist Mono",ui-monospace,monospace;
  --shadow-window:0 1px 2px rgba(0,0,0,.04),0 8px 24px rgba(0,0,0,.06);
}
```

Type scale: H1 72/1.05 (‑0.03em, Inter Tight, 600) → 44px on mobile · Section H2 40–48px · Card H3 18–20px · Body 14–16px · Table 13px · Eyebrow label 12px uppercase tracking 0.08em, muted. Confirm all values from `recon/tokens.json`.

### 4.2 Core components (`packages/ui`)

Button (primary black pill / secondary white pill / ghost / link-with-arrow "→") · Badge "New" · Chip / Tag (filter chips, highlight chips "+4") · Eyebrow · SectionHeader (eyebrow + H2 + lede + optional link) · FeatureCard (H3 + body + optional link) · StatCounter (count-up on view) · LogoMarquee (infinite, pause on hover, duplicated track, edge fade masks) · TestimonialCard (bold lead phrase + quote, avatar, firm logo, role, "Case Study →") · TestimonialMarquee (two rows, opposite directions) · AppWindow (mock window frame with sidebar) · DataTable (sticky header, favicon + name cell, % deltas coloured, "—" for nulls) · SignalCard (logo, category label, title, sentence, relative time "now / 22 min / 1 hr") · CodeBlock (tabs cURL/Python/JavaScript, copy button, JSON syntax highlight) · EndpointPill (method colour + path) · ChatComposer (input with `@ # /` affordances) · Accordion (FAQ) · Tabs (underline + pill variants) · ComparisonTable (✓/✗/text cells, grouped rows, expandable "Show N more") · Select · Form fields · Toast · Tooltip · Command palette (⌘K) · Avatar + AvatarStack · Sparkline · ConfidenceBandChart · DemoPill (floating).

### 4.3 Motion rules (`recon/motion.md` is authoritative)

- Section reveal: fade-up 12px, 400ms, ease-out, once, stagger children 60ms.
- Logo marquee: 40–60s linear infinite; testimonial marquee ~80s; respect `prefers-reduced-motion` (stop and show static grid).
- Signal tickers: new card slides in from top every 2.5–3.5s; list capped at 3–6 items; timestamps update.
- Agent demo: user prompt types at ~35 chars/s → tool-step lines appear with spinner → check → result card fades in → loop after 6s idle.
- API log terminal: lines append every 150–400ms, auto-scroll, loops.
- Count-ups: 1.2s ease-out when 40% visible.
- Tab sections (homepage "Data/Signals/Sourcing/Monitor"): sticky sub-nav that highlights the section in view (scroll-spy) and scroll-to on click.
- All mocks are **real React components with JSON fixtures** (not screenshots) so text stays crisp and translatable. **Build each grid/profile/chat component once in `packages/ui` and use it in both the app and the marketing mocks.** v1 implied building them twice.
- Mocks are decorative: wrap in `aria-hidden` where they duplicate nearby text, give each a short `aria-label` summary, pause all motion when off-screen (IntersectionObserver) to save CPU.

### 4.4 Accessibility & performance budgets

WCAG 2.2 AA; keyboard-navigable menus; app grids fully keyboard-operable (arrow keys, space to select, enter to open); visible focus rings; `aria-live="polite"` for tickers (throttled); Marketing: LCP < 2.0s, CLS < 0.05, INP < 200ms on mobile (lazy-mount mocks below the fold; JS for a marketing page ≤ 180 KB gzipped). App: grid scroll 60 fps with 5,000 rows; filter result P95 < 500 ms; profile load P95 < 800 ms; fonts `display: swap` + preloaded; images AVIF/WebP via `next/image`.
