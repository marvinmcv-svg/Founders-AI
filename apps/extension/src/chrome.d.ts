/** The slice of the Chrome extension API this extension uses (no @types/chrome dependency). */
declare namespace chrome {
  namespace runtime {
    const id: string;
    const lastError: { message?: string } | undefined;
    function sendMessage<T = unknown>(message: unknown): Promise<T>;
    function openOptionsPage(): Promise<void>;
    const onMessage: { addListener(cb: (msg: unknown, sender: { tab?: { id?: number; url?: string } }, sendResponse: (r: unknown) => void) => boolean | void): void };
    const onInstalled: { addListener(cb: () => void): void };
    const onStartup: { addListener(cb: () => void): void };
  }
  namespace storage {
    const local: { get(keys: string[] | string): Promise<Record<string, unknown>>; set(items: Record<string, unknown>): Promise<void> };
    const onChanged: { addListener(cb: (changes: Record<string, { newValue?: unknown }>, area: string) => void): void };
  }
  namespace tabs {
    type Tab = { id?: number; url?: string; active?: boolean };
    function query(q: { active?: boolean; currentWindow?: boolean; lastFocusedWindow?: boolean }): Promise<Tab[]>;
    function create(p: { url: string }): Promise<Tab>;
    const onActivated: { addListener(cb: (info: { tabId: number }) => void): void };
    const onUpdated: { addListener(cb: (tabId: number, change: { url?: string; status?: string }, tab: Tab) => void): void };
  }
  namespace sidePanel {
    function setPanelBehavior(p: { openPanelOnActionClick: boolean }): Promise<void>;
  }
  namespace permissions {
    function contains(p: { origins: string[] }): Promise<boolean>;
    function request(p: { origins: string[] }): Promise<boolean>;
  }
  namespace scripting {
    type Registered = { id: string };
    function getRegisteredContentScripts(f?: { ids?: string[] }): Promise<Registered[]>;
    function registerContentScripts(s: { id: string; matches: string[]; js: string[]; runAt?: string; persistAcrossSessions?: boolean }[]): Promise<void>;
    function unregisterContentScripts(f?: { ids?: string[] }): Promise<void>;
  }
}
