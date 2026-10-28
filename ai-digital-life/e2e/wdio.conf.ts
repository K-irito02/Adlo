import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TauriCapabilities } from '@wdio/tauri-service';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');
const appBinary = path.resolve(
  appRoot,
  'target',
  'debug',
  process.platform === 'win32' ? 'ai-digital-life.exe' : 'ai-digital-life',
);

// `TauriCapabilities` adds the `tauri:*` keys on top of WebdriverIO.Capabilities,
// which WDIO's `Config['capabilities']` union does not know about.
const capabilities: TauriCapabilities[] = [
  {
    browserName: 'tauri',
    'tauri:options': {
      application: appBinary,
    },
  },
];

/**
 * Desktop E2E via @wdio/tauri-service (embedded WebDriver provider).
 *
 * Prerequisites:
 *   pnpm --dir ai-digital-life/e2e run build:app   # target/debug binary with the `e2e` feature
 *   pnpm --dir ai-digital-life/e2e test
 */
export const config: WebdriverIO.Config = {
  runner: 'local',
  specs: ['./specs/**/*.spec.ts'],
  maxInstances: 1,

  services: [
    [
      '@wdio/tauri-service',
      {
        appBinaryPath: appBinary,
        driverProvider: 'embedded',
        embeddedPort: 4445,
        startTimeout: 120_000,
        commandTimeout: 60_000,
        captureBackendLogs: true,
        backendLogLevel: 'info',
      },
    ],
  ],

  capabilities: capabilities as unknown as WebdriverIO.Config['capabilities'],

  logLevel: 'warn',
  bail: 0,
  waitforTimeout: 15_000,
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 1,

  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 120_000,
  },

  /**
   * The service's per-command "recover focus" fallback matches windows by title.
   * This app's document title never equals the native window title, so the
   * fallback fails and logs a warning before nearly every command. Selecting the
   * window once by label both pins the target and suppresses that fallback.
   *
   * The service installs `browser.tauri` in its own worker `before` hook, which
   * can start after this one, so wait for it instead of relying on hook order.
   */
  before: async () => {
    for (let attempt = 0; attempt < 50 && !browser.tauri; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!browser.tauri) {
      throw new Error(
        '@wdio/tauri-service did not install browser.tauri within 5s; check the service config and the e2e guest plugin',
      );
    }
    await browser.tauri.switchWindow('main');
  },
};
