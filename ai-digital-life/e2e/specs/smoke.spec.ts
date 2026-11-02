import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { $, browser, expect } from '@wdio/globals';

const here = path.dirname(fileURLToPath(import.meta.url));
const artifactsDir = path.join(here, '..', 'artifacts');
const APP_TITLE = 'AI Digital Life';

/**
 * First run of a fresh instance shows the environment wizard on top of the shell.
 * Dismiss it by the wizard's testid, never by localized text.
 */
async function dismissSetupWizards(): Promise<void> {
  const envWizard = await $('[data-testid="env-wizard"]');
  if (await envWizard.isExisting()) {
    const skip = await envWizard.$('[data-testid="env-wizard-skip"]');
    if (await skip.isExisting()) {
      await skip.click();
    }
    await browser.waitUntil(async () => !(await envWizard.isExisting()), {
      timeout: 10_000,
      timeoutMsg: 'environment wizard stayed open after clicking skip',
    });
  }

  // 环境向导之后还会串行出现 harness 向导；它的全屏 overlay 会盖住标题栏，
  // 原生点击用例必须先把它关掉（否则 waitForTitlebarClickable 永远等不到）。
  const harnessDone = await browser.execute(() =>
    localStorage.getItem('adl.harnessWizardDone'),
  );
  if (harnessDone) {
    return;
  }
  const harnessWizard = await $('[data-testid="harness-wizard"]');
  try {
    await browser.waitUntil(async () => await harnessWizard.isExisting(), {
      timeout: 2_000,
      interval: 100,
    });
  } catch {
    return;
  }
  const harnessSkip = await harnessWizard.$('[data-testid="harness-wizard-skip"]');
  if (await harnessSkip.isExisting()) {
    await harnessSkip.click();
  }
  await browser.waitUntil(async () => !(await harnessWizard.isExisting()), {
    timeout: 10_000,
    timeoutMsg: 'harness wizard stayed open after clicking skip',
  });
}

/**
 * The app keeps a full-screen startup overlay for at least 3.5s. Instead of sleeping,
 * wait until the titlebar toggle is the topmost element at its own center.
 */
async function waitForTitlebarClickable(): Promise<void> {
  await browser.waitUntil(
    async () =>
      (await browser.execute(() => {
        const el = document.querySelector('.adl-iconstrip__button--paneltoggle');
        if (!el) {
          return false;
        }
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          return false;
        }
        const top = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
        return top !== null && (top === el || el.contains(top));
      })) === true,
    {
      timeout: 30_000,
      interval: 250,
      timeoutMsg: 'titlebar toggle never became clickable (startup overlay still on top?)',
    },
  );
}

describe('AI Digital Life desktop shell', () => {
  beforeEach(async () => {
    await dismissSetupWizards();
  });

  it('boots the Tauri shell', async () => {
    await browser.waitUntil(async () => (await browser.getTitle()) === APP_TITLE, {
      timeout: 60_000,
      timeoutMsg: 'window title never became the app title',
    });

    await dismissSetupWizards();
    await $('.adl-shell').waitForDisplayed({ timeout: 60_000 });

    const shellFlavor = await browser.execute(() => document.documentElement.dataset.shell);
    expect(shellFlavor).toBe('tauri');
  });

  it('round-trips a real Tauri command through the app bridge', async () => {
    type AppInfoPayload = { ok: boolean; data: { appName: string; version: string } };
    const result = await browser.executeAsync<{ ok: boolean; value: AppInfoPayload | string }, []>(
      (done) => {
        // The app installs its typed bridge on window before rendering.
        const bridge = (window as unknown as { digitalLife: { app: { getInfo: () => Promise<unknown> } } })
          .digitalLife;
        bridge.app.getInfo().then(
          (value) => done({ ok: true, value: value as AppInfoPayload }),
          (error) => done({ ok: false, value: String(error) }),
        );
      },
    );

    expect(result.ok).toBe(true);
    const info = (result.value as AppInfoPayload).data;
    expect(info.appName).toBe(APP_TITLE);
    expect(info.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('toggles a panel through a native click and reports window geometry', async () => {
    await dismissSetupWizards();
    await waitForTitlebarClickable();

    const toggle = await $('.adl-iconstrip__button--paneltoggle');
    const before = await toggle.getAttribute('aria-pressed');
    await toggle.click();
    await browser.waitUntil(async () => (await toggle.getAttribute('aria-pressed')) !== before, {
      timeout: 10_000,
      timeoutMsg: 'left panel aria-pressed did not change after click',
    });

    const rect = await browser.getWindowRect();
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);

    mkdirSync(artifactsDir, { recursive: true });
    await browser.saveScreenshot(path.join(artifactsDir, 'shell.png'));
  });

  it('runs a Tauri command through browser.tauri.execute', async () => {
    const info = await browser.tauri.execute(({ core }) =>
      core.invoke('app_get_info'),
    );

    const payload = info as { ok: boolean; data: { appName: string } };
    expect(payload.ok).toBe(true);
    expect(payload.data.appName).toBe(APP_TITLE);
  });

  it('mocks a command on the browser.tauri.execute path', async () => {
    const mock = await browser.tauri.mock('app_get_info');
    await mock.mockResolvedValue({ ok: true, data: { appName: 'Mocked App', version: '9.9.9' } });

    const mocked = (await browser.tauri.execute(({ core }) =>
      core.invoke('app_get_info'),
    )) as { ok: boolean; data: { appName: string; version: string } };

    expect(mocked.data.appName).toBe('Mocked App');

    await browser.tauri.restoreAllMocks();
  });

  it('renders compact status pills with the tone color, not the generic label color', async () => {
    await dismissSetupWizards();
    await $('.adl-shell').waitForDisplayed({ timeout: 60_000 });

    // 用 DOM click 而不是原生点击：本用例验的是 CSS 级联，不依赖启动遮罩的命中测试。
    await $('[id$="-settings-tab"]').waitForExist({ timeout: 15_000 });
    const opened = await browser.execute(() => {
      const tab = document.querySelector<HTMLElement>('[id$="-settings-tab"]');
      if (!tab) {
        return false;
      }
      tab.click();
      return true;
    });
    expect(opened).toBe(true);

    await $('[data-testid="settings-nav-environment"]').waitForExist({ timeout: 15_000 });
    const envOpened = await browser.execute(() => {
      const nav = document.querySelector<HTMLElement>('[data-testid="settings-nav-environment"]');
      if (!nav) {
        return false;
      }
      nav.click();
      return true;
    });
    expect(envOpened).toBe(true);

    await $('[data-testid="env-dep-node"]').waitForDisplayed({ timeout: 15_000 });

    type PillProbe =
      | { ok: true; color: string; background: string; tone: string; labelColor: string | null }
      | { ok: false; reason: string };

    // 真实 WebView 的级联结果；CSS 文本断言（`settings-status-badge.test.ts`）测不到这里。
    const result = (await browser.execute(() => {
      const pill = document.querySelector<HTMLElement>(
        '[data-testid="env-dep-node"] .adl-settings-status--compact',
      );
      if (!pill) {
        return { ok: false, reason: 'no compact pill' };
      }
      const label = pill.closest('.adl-settings-row__label-text');
      const style = getComputedStyle(pill);
      return {
        ok: true,
        color: style.color,
        background: style.backgroundColor,
        tone: style.getPropertyValue('--adl-row-label-color').trim(),
        labelColor: label ? getComputedStyle(label).color : null,
      };
    })) as PillProbe;

    if (!result.ok) {
      throw new Error(result.reason);
    }
    expect(result.tone).not.toBe('');
    expect(result.color).not.toBe(result.labelColor);
    expect(result.background).not.toBe('rgba(0, 0, 0, 0)');
  });
});
