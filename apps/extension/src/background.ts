/**
 * Service worker: opens the side panel from the toolbar and keeps the LinkedIn content script
 * registered only while (a) the workspace's `extension_linkedin_panel` flag is on and (b) the user
 * granted linkedin.com access. Default: not registered (plan 13.3 / H11).
 */
import { client } from "./core.js";
import { browserFetch, loadSettings } from "./settings.js";

const LINKEDIN = "https://www.linkedin.com/*";
const SCRIPT_ID = "founders-linkedin";

async function syncLinkedinScript() {
  const s = await loadSettings();
  let on = false;
  if (s.apiKey) {
    try {
      on = Boolean((await client(s, browserFetch).config()).linkedinPanel) && (await chrome.permissions.contains({ origins: [LINKEDIN] }));
    } catch {
      on = false;
    }
  }
  const registered = (await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] })).length > 0;
  if (on && !registered) await chrome.scripting.registerContentScripts([{ id: SCRIPT_ID, matches: ["https://www.linkedin.com/in/*", "https://www.linkedin.com/company/*"], js: ["linkedin.js"], runAt: "document_idle", persistAcrossSessions: true }]);
  if (!on && registered) await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  void syncLinkedinScript();
});
chrome.runtime.onStartup.addListener(() => void syncLinkedinScript());
chrome.storage.onChanged.addListener((_c, area) => {
  if (area === "local") void syncLinkedinScript();
});

/** The LinkedIn button asks the worker to look the page up (content scripts cannot hold the key). */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const m = msg as { type?: string; url?: string };
  if (m.type === "sync-linkedin") {
    void syncLinkedinScript().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (m.type !== "linkedin-lookup" || !m.url) return;
  void (async () => {
    const s = await loadSettings();
    if (!s.apiKey) return sendResponse({ ok: false, error: "Add your API key in the extension settings" });
    try {
      const api = client(s, browserFetch);
      const isPerson = /linkedin\.com\/in\//.test(m.url!);
      const hit = isPerson ? await api.lookupPerson(m.url!) : null;
      sendResponse({ ok: true, found: Boolean(hit?.id), url: hit?.id ? `${s.appUrl.replace(/\/+$/, "")}/${isPerson ? "people" : "companies"}/${String(hit.id)}` : null });
    } catch (e) {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : "Lookup failed" });
    }
  })();
  return true;
});
