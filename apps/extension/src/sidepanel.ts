/**
 * Side panel (plan 13.3): detects the active tab's site → company card (or person card on a
 * LinkedIn profile) → Push to CRM · Add to list · Like · View in app.
 */
import { client, companyCard, personCard, targetFromUrl, type Card } from "./core.js";
import { browserFetch, loadSettings } from "./settings.js";

const app = document.getElementById("app") as HTMLElement;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const c of children) e.append(c);
  return e;
}

/** For tests: the panel can be opened as sidepanel.html?url=<page> instead of reading the active tab. */
async function currentUrl(): Promise<string | undefined> {
  const fromQuery = new URLSearchParams(location.search).get("url");
  if (fromQuery) return fromQuery;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.url;
}

async function render() {
  const s = await loadSettings();
  if (!s.apiKey) {
    const open = el("button", { class: "primary" }, "Open settings");
    open.onclick = () => void chrome.runtime.openOptionsPage();
    app.replaceChildren(el("h1", {}, "Founders AI"), el("p", { class: "muted" }, "Add an API key to see company cards while you browse."), open);
    return;
  }
  const target = targetFromUrl(await currentUrl());
  if (target.kind === "none" || target.kind === "linkedin_company") {
    app.replaceChildren(el("h1", {}, "Founders AI"), el("p", { class: "muted" }, target.kind === "none" ? target.reason : "Company pages on LinkedIn: open the company's own website for its card."));
    return;
  }
  app.replaceChildren(el("p", { class: "muted" }, "Looking it up…"));
  const api = client(s, browserFetch);
  try {
    const hit = target.kind === "company" ? await api.lookupCompany(target.domain) : await api.lookupPerson(target.linkedinUrl);
    if (!hit || !hit.id) {
      app.replaceChildren(el("h1", {}, "Not in Founders AI yet"), el("p", { class: "muted" }, target.kind === "company" ? `No company found for ${target.domain}. Misses are free.` : "No matching person. Misses are free."));
      return;
    }
    show(target.kind === "company" ? companyCard(hit) : personCard(hit), s.appUrl, api);
  } catch (e) {
    app.replaceChildren(el("h1", {}, "Founders AI"), el("p", { class: "status err" }, e instanceof Error ? e.message : "Lookup failed"));
  }
}

function show(card: Card, appUrl: string, api: ReturnType<typeof client>) {
  const status = el("p", { class: "status", role: "status" });
  const say = (ok: boolean, text: string) => {
    status.className = `status ${ok ? "ok" : "err"}`;
    status.textContent = text;
  };
  const kpis = el("div", { class: "kpis" }, ...card.kpis.map((k) => el("div", { class: "kpi" }, el("span", { class: "faint" }, k.label), el("b", {}, k.value), k.delta === null || k.delta === undefined ? "" : el("span", { class: k.delta >= 0 ? "up" : "down" }, `${k.delta >= 0 ? "+" : ""}${k.delta}% 3m`))));
  const push = el("button", { class: "primary" }, "Push to CRM");
  push.onclick = async () => {
    push.setAttribute("disabled", "");
    try {
      const r = await api.push(card.id);
      say(true, `${Number(r.created) ? "Created" : "Updated"} in ${String(r.crm).toLowerCase()}`);
    } catch (e) {
      say(false, e instanceof Error ? e.message : "Push failed");
    } finally {
      push.removeAttribute("disabled");
    }
  };
  const like = el("button", {}, "Like");
  like.onclick = async () => {
    try {
      const r = await api.like(card.id);
      like.textContent = r.liked ? "Liked" : "Like";
      say(true, r.liked ? "Added to Liked" : "Removed from Liked");
    } catch (e) {
      say(false, e instanceof Error ? e.message : "Failed");
    }
  };
  const select = el("select", { "aria-label": "Add to list" }, el("option", { value: "" }, "Add to list…"));
  void api.lists(card.kind === "company" ? "company" : "people").then((ls) => ls.forEach((l) => select.append(el("option", { value: String(l.id) }, String(l.name)))));
  select.onchange = async () => {
    if (!select.value) return;
    try {
      await api.addToList(select.value, card.kind === "company" ? "companies" : "people", card.id);
      say(true, `Added to ${select.selectedOptions[0]?.textContent ?? "list"}`);
    } catch (e) {
      say(false, e instanceof Error ? e.message : "Failed");
    }
    select.value = "";
  };
  const view = el("a", { href: `${appUrl.replace(/\/+$/, "")}${card.appPath}`, target: "_blank", rel: "noopener" }, "View in app →");
  app.replaceChildren(
    el("div", { class: "card" }, el("h1", {}, card.title), el("p", { class: "muted" }, card.subtitle), el("div", { class: "row" }, ...card.chips.map((c) => el("span", { class: "chip" }, c)))),
    kpis,
    card.people.length ? el("div", { class: "card" }, el("b", {}, "Key people"), ...card.people.map((p) => el("span", { class: "muted" }, p))) : "",
    el("div", { class: "row" }, push, like, select),
    view,
    status,
  );
}

void render();
chrome.tabs.onActivated.addListener(() => void render());
chrome.tabs.onUpdated.addListener((_id, change, tab) => {
  if (tab.active && change.url) void render();
});
