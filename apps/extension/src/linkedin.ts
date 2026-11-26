/**
 * LinkedIn page button (plan 13.3), registered only when the workspace flag is on and the user
 * granted linkedin.com access. Reads nothing but the page address; adds one button; never scrapes.
 * Classic script (no imports): content scripts cannot be ES modules.
 */
(() => {
  const ID = "founders-ai-linkedin-button";
  let lastUrl = "";
  const place = () => {
    const url = location.origin + location.pathname;
    if (url === lastUrl && document.getElementById(ID)) return;
    lastUrl = url;
    document.getElementById(ID)?.remove();
    if (!/^\/(in|company)\/[^/]+/.test(location.pathname)) return;
    const b = document.createElement("button");
    b.id = ID;
    b.type = "button";
    b.textContent = "View on Founders AI";
    b.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:2147483647;padding:8px 14px;border-radius:999px;border:0;background:#d8ff4a;color:#0a0a0a;font:600 13px system-ui;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.25)";
    b.onclick = async () => {
      b.textContent = "Looking up…";
      const r = (await chrome.runtime.sendMessage({ type: "linkedin-lookup", url })) as { ok: boolean; found?: boolean; url?: string | null; error?: string };
      if (r.ok && r.found && r.url) {
        window.open(r.url, "_blank", "noopener");
        b.textContent = "View on Founders AI";
      } else b.textContent = r.ok ? "Not in Founders AI yet" : (r.error ?? "Lookup failed");
    };
    document.body.append(b);
  };
  place();
  // LinkedIn is a single-page app: re-check the address when it changes.
  setInterval(place, 1500);
})();
