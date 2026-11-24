import { describe, it, expect, vi } from 'vitest';
import { executeBrowserResetPlan } from './browserReset';
import { DEFAULT_BROWSER_SUSPEND_MS, DEFAULT_DOWNLOAD_MODE } from '@shared/defaultPreferences';
import type { BrowserResetDeps } from './browserReset';

function deps(overrides: Partial<BrowserResetDeps> = {}): BrowserResetDeps {
  return {
    updatePreferences: vi.fn(async () => true),
    updateDownloadSettings: vi.fn(async () => ({ ok: true as const, data: undefined })),
    downloadPath: {
      changeDownloadPath: vi.fn(async () => ({ ok: true as const, data: undefined })),
      updateDownloadSettings: vi.fn(async () => ({ ok: true as const, data: undefined })),
    },
    resetShareProfile: vi.fn(),
    migrateAtOpen: false,
    ...overrides,
  };
}

describe('executeBrowserResetPlan', () => {
  it('按共享 profile → 挂起 → 下载模式 → 下载路径顺序执行', async () => {
    const d = deps();
    expect((await executeBrowserResetPlan(d)).ok).toBe(true);
    expect(d.updatePreferences).toHaveBeenCalledWith({
      browserInactiveTabSuspendMs: DEFAULT_BROWSER_SUSPEND_MS,
      browserSuspendWhitelistEnabled: false,
      browserSuspendWhitelist: [],
    });
    expect(d.updateDownloadSettings).toHaveBeenCalledWith(DEFAULT_DOWNLOAD_MODE);
    expect(d.downloadPath.changeDownloadPath).toHaveBeenCalledWith('', false);
    expect(d.resetShareProfile).toHaveBeenCalled();
  });

  it('挂起失败时 failedStep=suspend，后续步不执行', async () => {
    const d = deps({ updatePreferences: vi.fn(async () => false) });
    expect(await executeBrowserResetPlan(d)).toEqual({ ok: false, failedStep: 'suspend' });
    expect(d.updateDownloadSettings).not.toHaveBeenCalled();
  });

  it('下载模式失败时 failedStep=downloadMode，路径步不执行', async () => {
    const d = deps({
      updateDownloadSettings: vi.fn(async () => ({
        ok: false as const,
        error: { code: 'Internal' as const, message: 'x' },
      })),
    });
    const out = await executeBrowserResetPlan(d);
    expect(out).toEqual({
      ok: false,
      failedStep: 'downloadMode',
      error: { code: 'Internal', message: 'x' },
    });
    expect(d.downloadPath.changeDownloadPath).not.toHaveBeenCalled();
  });
});
