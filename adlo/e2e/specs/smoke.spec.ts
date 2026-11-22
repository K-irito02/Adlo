import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { $, browser, expect } from '@wdio/globals';
import { dismissSetupWizards, waitForTitlebarClickable } from './helpers';

const here = path.dirname(fileURLToPath(import.meta.url));
const artifactsDir = path.join(here, '..', 'artifacts');
const APP_TITLE = 'Adlo';

describe('Adlo desktop shell', () => {
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

  it('keeps runtime-injected <style> effective in the packaged CSP (no style-src nonce)', async () => {    // CodeMirror 的结构/主题 CSS（style-mod）与 Markdown 预览主题都靠运行时注入 <style>；
    // 构建产物 index.html 自带内联 <style>，若 Tauri 给 style-src 追加 'nonce-…'，
    // 按 CSP3 会忽略 'unsafe-inline'，这些样式全部失效（变更面板差异视图行号跑到最右、
    // 变更块变整宽色条）。frontend/src/tauri-csp-config.test.ts 守配置文本，本用例在真实
    // 打包 WebView 里守实际效果。
    const color = (await browser.execute(() => {
      const probeId = '__adl_runtime_style_probe__';
      const style = document.createElement('style');
      style.textContent = `#${probeId} { color: rgb(1, 2, 3); }`;
      document.head.appendChild(style);

      const el = document.createElement('div');
      el.id = probeId;
      el.textContent = 'probe';
      document.body.appendChild(el);

      const computed = getComputedStyle(el).color;
      style.remove();
      el.remove();
      return computed;
    })) as string;

    expect(color).toBe('rgb(1, 2, 3)');
  });

  it('keeps blob: images usable in the packaged CSP (img-src must list blob:)', async () => {
    // 事项 8：打包态 `img-src`/`media-src` 曾缺 `blob:`，`MediaPreview` 的 object URL 被拦，
    // 用户看到「媒体预览失败：当前环境无法解码或播放该文件」；dev 由 Vite 供页、不注入 CSP，
    // 所以只在打包版复现。`frontend/src/tauri-csp-config.test.ts` 守配置文本，本用例在真实
    // 打包 WebView 里守实际效果（Office 内嵌媒体/pptx 预览仍依赖 blob）。
    type BlobProbe = { ok: true; width: number } | { ok: false; reason: string };
    const result = (await browser.executeAsync((done) => {
      const canvas = document.createElement('canvas');
      canvas.width = 4;
      canvas.height = 4;
      const ctx = canvas.getContext('2d');
      ctx?.fillRect(0, 0, 4, 4);
      canvas.toBlob((blob) => {
        if (!blob) {
          done({ ok: false, reason: 'canvas.toBlob produced no blob' });
          return;
        }
        const url = URL.createObjectURL(blob);
        const img = new Image();
        const timer = setTimeout(() => {
          URL.revokeObjectURL(url);
          done({ ok: false, reason: 'blob image never decoded (CSP blocked?)' });
        }, 3_000);
        img.onload = () => {
          clearTimeout(timer);
          URL.revokeObjectURL(url);
          done({ ok: true, width: img.naturalWidth });
        };
        img.onerror = () => {
          clearTimeout(timer);
          URL.revokeObjectURL(url);
          done({ ok: false, reason: 'blob image fired error (CSP or decode)' });
        };
        img.src = url;
      }, 'image/png');
    })) as BlobProbe;

    if (!result.ok) {
      throw new Error(result.reason);
    }
    expect(result.width).toBe(4);
  });

  it('allows WebAssembly compilation in the packaged CSP (starry-night onig.wasm)', async () => {
    // `script-src 'self'` 默认不允许 WebAssembly 编译；缺 `'wasm-unsafe-eval'` 时
    // Markdown 代码高亮会静默退化为纯文本。最小合法 wasm 模块：\0asm + version 1。
    await browser.execute(() => {
      (window as unknown as { __adlWasmProbe?: string | null }).__adlWasmProbe = null;
      WebAssembly.instantiate(Uint8Array.from([0, 97, 115, 109, 1, 0, 0, 0])).then(
        () => {
          (window as unknown as { __adlWasmProbe?: string | null }).__adlWasmProbe = 'ok';
        },
        (error) => {
          (window as unknown as { __adlWasmProbe?: string | null }).__adlWasmProbe =
            `error:${String(error)}`;
        },
      );
    });

    await browser.waitUntil(
      async () =>
        (await browser.execute(
          () => (window as unknown as { __adlWasmProbe?: string | null }).__adlWasmProbe,
        )) !== null,
      { timeout: 5_000, interval: 100, timeoutMsg: 'WebAssembly probe never settled' },
    );
    const wasmResult = await browser.execute(
      () => (window as unknown as { __adlWasmProbe?: string | null }).__adlWasmProbe,
    );
    expect(wasmResult).toBe('ok');
  });
});
