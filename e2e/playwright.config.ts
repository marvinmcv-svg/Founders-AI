import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

const preinstalled = "/opt/pw-browsers/chromium";

/** Expects `pnpm dev` running (www :3000, app :3001) against a seeded DB. */
export default defineConfig({
  testDir: "tests",
  timeout: 90_000,
  workers: 1, // app tests share one demo workspace
  use: { viewport: { width: 1440, height: 900 }, trace: "off", launchOptions: existsSync(preinstalled) ? { executablePath: preinstalled } : {} },
  projects: [
    { name: "www", testMatch: /www\..*\.spec\.ts/, use: { baseURL: process.env.WWW_URL ?? "http://localhost:3000" } },
    { name: "app", testMatch: /app\..*\.spec\.ts/, use: { baseURL: process.env.APP_URL ?? "http://localhost:3001" } },
  ],
});
