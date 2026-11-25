## 2. PHASE 0 RECON WITH REA — EXACT WORKFLOW

Goal: capture the public site's structure, routes, motion, network calls and front-end architecture so the front-end team can reproduce layout and interactions precisely.

> **v2 note:** REA is mainly a reverse-engineering MCP for binaries and apps. Its web tools need a Chromium you control. Tool names below come from REA's docs at the time of writing — **run `rea --help` and read the generated tool catalog (`docs/reference/mcp-contracts.md`) first, and adapt the names if they changed.** If a REA web tool is unavailable, fall back to Playwright (screenshots, HAR, computed styles) for that step. Throttle captures to ≤ 1 page every 10 s and respect robots.txt.

### 2.1 Install

```bash
# from a trusted directory OUTSIDE our repo
npx rea-agents setup          # registers REA's MCP server + investigation skill with your agent
# or CLI:
npm install --global rea-agents && rea --help
```

Static JavaScript/website analysis needs **no** Hopper/Ghidra/IDA. Linux needs a Chromium build supporting `import.meta.resolve` for module tracing (`REA_BROWSER_EXECUTABLE=/path/to/chrome`).

### 2.2 Pages to capture (public only)

```
/  /platform  /companies  /people  /investors  /transactions
/signals/talent  /signals/interest  /news  /revenue-valuation
/agents  /api  /mcp  /integrations  /pricing  /contact  /partners  /careers  /blog
/comparisons/specter-vs-{pitchbook,harmonic,grata,sourcescrub,cb-insights,crunchbase,dealroom}
/comparisons/{pitchbook,harmonic,grata}-alternatives
/privacy-policy  /privacy-rights  /terms-conditions
```

### 2.3 Per-page REA procedure

1. **Passive inspection with script sources** — MCP `inspect_web_page` with `include_script_sources: true` (CLI `--include-script-sources`). Save the Evidence JSON to `~/recon-raw/<page>/capture.json` (outside the repo — Rule 9).
2. **Scenario capture for interactions** — MCP `capture_browser_scenario` with `capture.network.response_body: true`. Script these scenarios per page: scroll top→bottom slowly; hover every header menu; open every mega-menu; click every tab (e.g. homepage "Data / Signals / Sourcing / Monitor"; profile tabs Overview…Competitors; "Revenue / Valuation" toggle; "Show 4 more datasets"); open every FAQ accordion; focus the demo form fields and open the "Firm type" and "AUM" selects (do **not** submit).
3. **Export scripts** — `export_web_scripts` (CLI `rea export-web-scripts ~/recon-raw/<page>/capture.json ~/recon-raw/<page>/scripts --json`).
4. **Static analysis** — `analyze_javascript_application` on the exported `files/` dir, and `analyze_web_bundle` with view `{kind:"web-bundle", collection:"endpoints"}` to list every network endpoint the page calls (analytics, form submission, booking widget, counters).
5. **Route inventory** — view `{kind:"javascript-routes", collection:"routes"}` to confirm the full route list (compare with sitemap).
6. **API surface of the marketing site** — `inspect_analysis_view` with `api-surface` / `environment-manifest` on the HAR/scenario Evidence → tells us how the demo form posts, how "N demos this hour" is fetched, what analytics fire.
7. **Runtime attribution for animations** — attach to Chrome via CDP (`list_browser_targets`, then `observe_web_execution` with `observation_ms: 15000`) while scrolling, to find which modules drive marquee, ticker, typing and count-up animations (expect Framer Motion / `motion` + IntersectionObserver).
8. **Module & source mapping** — `trace_web_module_imports` and, where public source maps exist, `trace_web_source_location` to identify libraries (Next.js App Router, Tailwind, Radix/shadcn, motion, charting lib).

### 2.4 Additional captures (non-REA, also required)

- Full-page screenshots at **1440, 1024, 768, 390 px** widths for every page → `~/recon-raw/<page>/screens/` (internal reference only; never committed or published).
- Computed styles of: H1/H2/H3/body, buttons (primary/secondary), cards, tables, chips, inputs, section spacing → `recon/tokens.json`.
- A screen recording of each animated section (used as the motion reference).
- Lighthouse report of each page (our target: equal or better).

### 2.5 Recon deliverables (Phase 0 exit criteria)

- [ ] `recon/README.md` — per page: section list, components used, animations, network calls, libraries identified
- [ ] `recon/routes.md` — final route list
- [ ] `recon/tokens.json` — colours, fonts, sizes, radii, shadows, spacing
- [ ] `recon/motion.md` — each animation: trigger, duration, easing, loop behaviour
- [ ] `recon/forms.md` — demo form + partner form fields, validation, submit target
- [ ] Screens at 4 breakpoints for every page (outside repo)
- [ ] `recon/sections.md` — for each page, the ordered list of section IDs we will build (e.g. `home.hero`, `home.logos`, …) — this becomes the copy-key namespace and the structural parity checklist

Already-confirmed findings from our research (verify with REA):
- Framework: **Next.js** (`next-size-adjust` meta present), **Tailwind** design system
- Fonts: **Geist** (body) and **Inter Tight** (headings); fallback stack Inter → system-ui
- Colour: primary `#4A62FF`, accent/link `#4459E8`, background `#F9FAFA`, body text `#3F3F46`, ink `#19191A`
- Buttons: primary = black `#000` pill (radius 9999px) with white text; secondary = white `#FEFEFE` pill, `#D1D4DA` border, black text
- Base spacing unit 4px, card radius 8px; H1 ≈ 72px, H2 ≈ 24px (section eyebrow-style H2s are larger — confirm), body 14px
- Light colour scheme, "modern, low-energy" tone, audience = investors and finance professionals
