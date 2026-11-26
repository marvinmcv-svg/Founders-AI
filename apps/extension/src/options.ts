import { client, DEFAULT_APP_URL } from "./core.js";
import { browserFetch, loadSettings } from "./settings.js";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const key = $<HTMLInputElement>("key");
const base = $<HTMLInputElement>("base");
const status = $<HTMLParagraphElement>("status");
const say = (ok: boolean, text: string) => {
  status.className = `status ${ok ? "ok" : "err"}`;
  status.textContent = text;
};

void loadSettings().then((s) => {
  key.value = s.apiKey;
  base.value = s.appUrl === DEFAULT_APP_URL ? "" : s.appUrl;
});

$("save").onclick = async () => {
  const appUrl = base.value.trim() || DEFAULT_APP_URL;
  try {
    const origin = new URL(appUrl).origin;
    // A custom deployment needs host access to its origin (asked once, by the browser).
    if (appUrl !== DEFAULT_APP_URL && !(await chrome.permissions.contains({ origins: [`${origin}/*`] }))) await chrome.permissions.request({ origins: [`${origin}/*`] });
  } catch {
    return say(false, "Enter a valid app URL");
  }
  await chrome.storage.local.set({ apiKey: key.value.trim(), appUrl });
  say(true, "Saved.");
};

$("test").onclick = async () => {
  try {
    const c = await client(await loadSettings(), browserFetch).config();
    say(true, `Connected to ${String((c.org as { name?: string } | undefined)?.name ?? "your workspace")}.`);
  } catch (e) {
    say(false, e instanceof Error ? e.message : "Connection failed");
  }
};

$("grant").onclick = async () => {
  const ok = await chrome.permissions.request({ origins: ["https://www.linkedin.com/*"] });
  say(ok, ok ? "Allowed. The panel appears on LinkedIn once your workspace enables it." : "Not allowed.");
  await chrome.runtime.sendMessage({ type: "sync-linkedin" });
};
