import { describe, it, expect, vi } from 'vitest';
import { resetDownloadPathToDefault } from './downloadPathReset';
import type { DownloadPathResetDeps } from './types';

function deps(overrides: Partial<DownloadPathResetDeps> = {}): DownloadPathResetDeps {
  return {
    changeDownloadPath: vi.fn(async () => ({
      ok: true as const,
      data: { migrated: 0, missing: 0, failed: 0 },
    })),
    updateDownloadSettings: vi.fn(async () => ({ ok: true as const, data: undefined })),
    ...overrides,
  };
}

describe('resetDownloadPathToDefault', () => {
  it('路径写回空串并传入 migrate，且开关复位为关闭', async () => {
    const d = deps();
    const result = await resetDownloadPathToDefault(d, true);
    expect(result.ok).toBe(true);
    expect(d.changeDownloadPath).toHaveBeenCalledWith('', true);
    expect(d.updateDownloadSettings).toHaveBeenCalledWith(undefined, undefined, false);
  });

  it('路径步失败时返回 failedStep=downloadPath，且开关步仍执行（解耦）', async () => {
    const d = deps({
      changeDownloadPath: vi.fn(async () => ({
        ok: false as const,
        error: { code: 'Internal' as const, message: 'boom' },
      })),
    });
    const result = await resetDownloadPathToDefault(d, false);
    expect(result).toEqual({
      ok: false,
      failedStep: 'downloadPath',
      error: { code: 'Internal', message: 'boom' },
    });
    expect(d.updateDownloadSettings).toHaveBeenCalledWith(undefined, undefined, false);
  });

  it('开关步失败时返回 failedStep=downloadPathSwitch（路径步已成功）', async () => {
    const d = deps({
      updateDownloadSettings: vi.fn(async () => ({
        ok: false as const,
        error: { code: 'Internal' as const, message: 'switch boom' },
      })),
    });
    const result = await resetDownloadPathToDefault(d, false);
    expect(result).toEqual({
      ok: false,
      failedStep: 'downloadPathSwitch',
      error: { code: 'Internal', message: 'switch boom' },
    });
    expect(d.changeDownloadPath).toHaveBeenCalledWith('', false);
  });
});
