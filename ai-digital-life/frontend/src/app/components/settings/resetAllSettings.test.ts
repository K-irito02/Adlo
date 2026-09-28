import { describe, it, expect, vi } from 'vitest';
import { resetAllSettings } from './resetAllSettings';
import { getDefaultPreferences } from '@shared/defaultPreferences';
import type { ResetAllDeps } from './resetAllSettings';

function deps(overrides: Partial<ResetAllDeps> = {}): ResetAllDeps {
  return {
    updatePreferences: vi.fn(async () => true),
    browser: {
      updatePreferences: vi.fn(async () => true),
      updateDownloadSettings: vi.fn(async () => ({ ok: true as const, data: undefined })),
      downloadPath: {
        changeDownloadPath: vi.fn(async () => ({ ok: true as const, data: undefined })),
        updateDownloadSettings: vi.fn(async () => ({ ok: true as const, data: undefined })),
      },
      migrateAtOpen: false,
    },
    dsh: { saveSourceConfig: vi.fn(async () => true) },
    storage: {
      setPaths: vi.fn(async () => ({
        ok: true as const,
        restartRequired: false,
        preflight: {
          ok: true,
          totalFiles: 0,
          totalBytes: 0,
          errors: [],
          warnings: [],
          freeBytes: 0,
        },
      })),
      resetBudget: vi.fn(async () => true),
      resetTreeCache: vi.fn(async () => true),
      downloadPath: {
        changeDownloadPath: vi.fn(async () => ({ ok: true as const, data: undefined })),
        updateDownloadSettings: vi.fn(async () => ({ ok: true as const, data: undefined })),
      },
    },
    ...overrides,
  };
}

const STORAGE_PLAN = {
  blocks: { coreNeeded: false, tree: 'hidden' as const, budget: true, download: 'hidden' as const },
  preflight: null,
  migrateAtOpen: false,
};

describe('resetAllSettings', () => {
  it('顺序为 preferences → browser → dsh → storage，且进度逐步回调', async () => {
    const d = deps();
    const seen: string[] = [];
    const outcome = await resetAllSettings(
      d,
      { storagePlan: STORAGE_PLAN, applyNow: false, retainSource: false },
      (k) => seen.push(k),
    );
    expect(d.updatePreferences).toHaveBeenCalledWith(getDefaultPreferences());
    expect(seen).toEqual(['preferences', 'browser', 'dsh', 'storage']);
    expect(outcome.done).toEqual(['preferences', 'browser', 'dsh', 'storage']);
    expect(outcome.skipped).toEqual([]);
  });

  it('preferences 失败即停：其余三组都不执行并计入 skipped', async () => {
    const d = deps({ updatePreferences: vi.fn(async () => false) });
    const outcome = await resetAllSettings(d, {
      storagePlan: STORAGE_PLAN,
      applyNow: false,
      retainSource: false,
    });
    expect(outcome).toEqual({
      done: [],
      failedAt: 'preferences',
      failedStep: 'preferences',
      skipped: ['browser', 'dsh', 'storage'],
      restartRequired: false,
    });
    expect(d.browser.updatePreferences).not.toHaveBeenCalled();
    expect(d.dsh.saveSourceConfig).not.toHaveBeenCalled();
    expect(d.storage.resetBudget).not.toHaveBeenCalled();
  });

  it('browser 失败即停：dsh 与 storage 都不执行，且计入 skipped', async () => {
    const d = deps({ browser: { ...deps().browser, updatePreferences: vi.fn(async () => false) } });
    const outcome = await resetAllSettings(d, {
      storagePlan: STORAGE_PLAN,
      applyNow: false,
      retainSource: false,
    });
    expect(outcome).toEqual({
      done: ['preferences'],
      failedAt: 'browser',
      failedStep: 'suspend',
      skipped: ['dsh', 'storage'],
      restartRequired: false,
    });
    expect(d.dsh.saveSourceConfig).not.toHaveBeenCalled();
    expect(d.storage.resetBudget).not.toHaveBeenCalled();
  });

  it('storagePlan 为 null 时存储计入 skipped，其余照常执行', async () => {
    const d = deps();
    const outcome = await resetAllSettings(d, {
      storagePlan: null,
      applyNow: false,
      retainSource: false,
    });
    expect(outcome.done).toEqual(['preferences', 'browser', 'dsh']);
    expect(outcome.skipped).toEqual(['storage']);
  });

  it('storage 的 restartRequired 透传到 outcome', async () => {
    const d = deps({
      storage: {
        ...deps().storage,
        setPaths: vi.fn(async () => ({
          ok: true as const,
          restartRequired: true,
          preflight: {
            ok: true,
            totalFiles: 0,
            totalBytes: 0,
            errors: [],
            warnings: [],
            freeBytes: 0,
          },
        })),
      },
    });
    const plan = { ...STORAGE_PLAN, blocks: { ...STORAGE_PLAN.blocks, coreNeeded: true } };
    const outcome = await resetAllSettings(d, {
      storagePlan: plan,
      applyNow: true,
      retainSource: false,
    });
    expect(outcome.restartRequired).toBe(true);
    expect(outcome.done).toContain('storage');
  });

  it('注入步骤抛出异常时返回失败结果而非 reject', async () => {
    const d = deps({
      browser: {
        ...deps().browser,
        updatePreferences: vi.fn(async () => {
          throw new Error('boom');
        }),
      },
    });
    const outcome = await resetAllSettings(d, {
      storagePlan: STORAGE_PLAN,
      applyNow: false,
      retainSource: false,
    });
    expect(outcome.failedAt).toBe('browser');
    expect(outcome.failedStep).toBe('unexpected');
    expect(outcome.done).toEqual(['preferences']);
    expect(outcome.skipped).toEqual(['dsh', 'storage']);
    expect(d.dsh.saveSourceConfig).not.toHaveBeenCalled();
    expect(d.storage.resetBudget).not.toHaveBeenCalled();
  });

  it('抛出原生 Error 时把 message 透传到 outcome.error（不再吞掉错误信息）', async () => {
    const d = deps({
      dsh: {
        saveSourceConfig: vi.fn(async () => {
          throw new Error('boom');
        }),
      },
    });
    const outcome = await resetAllSettings(d, {
      storagePlan: STORAGE_PLAN,
      applyNow: false,
      retainSource: false,
    });
    expect(outcome.failedAt).toBe('dsh');
    expect(outcome.failedStep).toBe('unexpected');
    expect(outcome.error?.message).toBe('boom');
    expect(outcome.done).toEqual(['preferences', 'browser']);
    expect(outcome.skipped).toEqual(['storage']);
  });

  it('抛出非 Error 值时仍 resolve（不 reject），error 归一化为通用结构化错误', async () => {
    const d = deps({
      browser: {
        ...deps().browser,
        updatePreferences: vi.fn(async () => {
          throw 'nope';
        }),
      },
    });
    const outcome = await resetAllSettings(d, {
      storagePlan: STORAGE_PLAN,
      applyNow: false,
      retainSource: false,
    });
    expect(outcome.failedStep).toBe('unexpected');
    expect(typeof outcome.error?.code).toBe('string');
    expect(typeof outcome.error?.message).toBe('string');
  });

  it('返回式失败的结构化 error 原样透传到 outcome.error', async () => {
    const d = deps({
      storage: {
        ...deps().storage,
        setPaths: vi.fn(async () => ({
          ok: false as const,
          error: { code: 'Internal' as const, message: 'nope' },
        })),
      },
    });
    const plan = { ...STORAGE_PLAN, blocks: { ...STORAGE_PLAN.blocks, coreNeeded: true } };
    const outcome = await resetAllSettings(d, {
      storagePlan: plan,
      applyNow: true,
      retainSource: false,
    });
    expect(outcome.failedAt).toBe('storage');
    expect(outcome.failedStep).toBe('corePaths');
    expect(outcome.error).toEqual({ code: 'Internal', message: 'nope' });
  });

  it('storage 首个失败块无 error 时回落到下载块的结构化 error（F1）', async () => {
    // 预算腿失败（失败块不携带 error）+ 下载腿失败（携带结构化 error）：
    // runStorage 的回落分支须把下载族的结构化错误带出，避免原因被静默吞掉。
    const downloadError = { code: 'Internal' as const, message: 'migrate failed' };
    const d = deps({
      storage: {
        ...deps().storage,
        resetBudget: vi.fn(async () => false),
        downloadPath: {
          changeDownloadPath: vi.fn(async () => ({ ok: false as const, error: downloadError })),
          updateDownloadSettings: vi.fn(async () => ({ ok: true as const, data: undefined })),
        },
      },
    });
    const outcome = await resetAllSettings(d, {
      storagePlan: {
        blocks: { coreNeeded: false, tree: 'hidden', budget: true, download: 'on' },
        migrateAtOpen: true,
      },
      applyNow: false,
      retainSource: false,
    });
    expect(outcome.failedAt).toBe('storage');
    // 首个失败块为预算（不携带 error）：failedStep 保留其码不改写。
    expect(outcome.failedStep).toBe('budget');
    // error 回落到下载块的下载族结构化错误（直接覆盖 runStorage 的回落分支）。
    expect(outcome.error).toEqual(downloadError);
  });
});
