import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 锁住「失败不缓存」：生成物 chunk 加载失败后，再次打开弹窗必须重新尝试。
 * 这里 mock 生成物模块本身，而不是 mock `thirdPartyNoticeData`，才能覆盖真实缓存逻辑。
 */
const data = {
  schemaVersion: 1 as const,
  sources: { cargoLock: 'cargo-sha', pnpmLock: 'npm-sha' },
  totals: { total: 0, npm: 0, cargo: 0, unknownLicense: 0, missingText: 0 },
  licenseTexts: {},
  packages: [],
};

describe('loadThirdPartyNoticeData', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock('./thirdPartyNotices.generated');
  });

  it('does not cache a failed load and retries on the next open', async () => {
    let accesses = 0;
    vi.doMock('./thirdPartyNotices.generated', () => ({
      get THIRD_PARTY_NOTICES_DATA() {
        accesses += 1;
        if (accesses === 1) {
          throw new Error('chunk failed');
        }
        return data;
      },
    }));
    const { loadThirdPartyNoticeData } = await import('./thirdPartyNoticeData');

    await expect(loadThirdPartyNoticeData()).rejects.toThrow('chunk failed');
    await expect(loadThirdPartyNoticeData()).resolves.toBe(data);
    expect(accesses).toBe(2);
  });

  it('caches a successful load', async () => {
    let accesses = 0;
    vi.doMock('./thirdPartyNotices.generated', () => ({
      get THIRD_PARTY_NOTICES_DATA() {
        accesses += 1;
        return data;
      },
    }));
    const { loadThirdPartyNoticeData } = await import('./thirdPartyNoticeData');

    await expect(loadThirdPartyNoticeData()).resolves.toBe(data);
    await expect(loadThirdPartyNoticeData()).resolves.toBe(data);
    expect(accesses).toBe(1);
  });
});
