import { DEFAULT_APP_URL, type Settings } from "./core.js";

export async function loadSettings(): Promise<Settings> {
  const s = await chrome.storage.local.get(["apiKey", "appUrl"]);
  return { apiKey: typeof s.apiKey === "string" ? s.apiKey : "", appUrl: typeof s.appUrl === "string" && s.appUrl ? s.appUrl : DEFAULT_APP_URL };
}

export const browserFetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => fetch(url, init);
