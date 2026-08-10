import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const frontendRoot = path.dirname(__filename);
const repoRoot = path.resolve(frontendRoot, "..");
const e2eHost = process.env.ADL_E2E_HOST ?? "127.0.0.1";
const e2ePort = process.env.ADL_E2E_PORT ?? "5173";
const baseURL = process.env.ADL_E2E_BASE_URL ?? `http://${e2eHost}:${e2ePort}`;

// Real-server mode: set ADL_E2E_AD_SERVER_URL (and usually ADL_AD_SERVER_PORT)
// to boot Vite via `dev:preview`, which spawns the real ad-server, probes it
// and injects VITE_ADL_SERVER_URL into the frontend. Otherwise the default
// `dev:browser` (preview/mock fallback) is used.
const adServerUrl = process.env.ADL_E2E_AD_SERVER_URL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: adServerUrl
      ? "pnpm --dir frontend run dev:preview"
      : "npm run dev:browser",
    cwd: repoRoot,
    env: {
      ADL_HOST: e2eHost,
      ADL_PORT: e2ePort,
    },
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
