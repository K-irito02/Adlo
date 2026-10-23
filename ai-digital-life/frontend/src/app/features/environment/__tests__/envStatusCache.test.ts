import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  getCachedEnvStatus,
  setCachedEnvStatus,
  resetEnvSettingsCache,
  prefetchEnvSettings,
  isWellFormedEnvStatus,
} from '../envStatusCache';
import type { EnvStatus } from '../../../../shared/ipc/env';

function fakeStatus(): EnvStatus {
  const dep = {
    mode: 'auto' as const,
    effective: 'host' as const,
    origin: 'path' as const,
    installedVersion: '1.0.0',
    baselineVersion: '1.0.0',
    meetsBaseline: true,
    path: 'C:/hosted/x',
  };
  return {
    node: { ...dep },
    git: { ...dep },
    bash: { ...dep },
    webview2: {
      mode: 'auto',
      effective: 'system',
      origin: 'registry',
      installedVersion: '140.0.0.0',
      baselineVersion: '140.0.0.0',
      meetsBaseline: true,
      path: null,
    },
    adlserver: { ...dep },
    netprobe: { registryOk: true, registryLatencyMs: 1, ciTokenConfigured: false },
    task: null,
    dataDir: 'C:/data-root',
    dshReady: true,
  };
}

const mockGetStatus = vi.fn();

describe('envStatusCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEnvSettingsCache();
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      env: { getStatus: (...args: unknown[]) => mockGetStatus(...args) },
    };
  });

  afterEach(() => {
    resetEnvSettingsCache();
    (window as unknown as { digitalLife?: unknown }).digitalLife = undefined;
  });

  it('set/get 往返：写入的快照原样读回', () => {
    expect(getCachedEnvStatus()).toBeNull();
    const status = fakeStatus();
    setCachedEnvStatus(status);
    expect(getCachedEnvStatus()).toBe(status);
  });

  it('reset 清空缓存（测试隔离）', () => {
    setCachedEnvStatus(fakeStatus());
    resetEnvSettingsCache();
    expect(getCachedEnvStatus()).toBeNull();
  });

  it('畸形体不算良构：缺段即 false', () => {
    expect(isWellFormedEnvStatus(fakeStatus())).toBe(true);
    expect(isWellFormedEnvStatus(null)).toBe(false);
    expect(isWellFormedEnvStatus({ node: {} })).toBe(false);
    const bad = fakeStatus() as unknown as Record<string, unknown>;
    delete bad.netprobe;
    expect(isWellFormedEnvStatus(bad)).toBe(false);
  });

  it('prefetch 冷填充：为空时拉取并写入', async () => {
    mockGetStatus.mockResolvedValue({ ok: true, data: fakeStatus() });
    await prefetchEnvSettings();
    expect(mockGetStatus).toHaveBeenCalledTimes(1);
    expect(getCachedEnvStatus()?.dshReady).toBe(true);
  });

  it('prefetch 命中后 no-op：不再重拉', async () => {
    setCachedEnvStatus(fakeStatus());
    await prefetchEnvSettings();
    expect(mockGetStatus).not.toHaveBeenCalled();
  });

  it('prefetch fail-open：桥抛错/失败静默放弃，不抛错不写缓存', async () => {
    mockGetStatus.mockRejectedValue(new Error('bridge gone'));
    await expect(prefetchEnvSettings()).resolves.toBeUndefined();
    expect(getCachedEnvStatus()).toBeNull();
    mockGetStatus.mockResolvedValue({ ok: false, error: { code: 'X', message: 'no' } });
    await expect(prefetchEnvSettings()).resolves.toBeUndefined();
    expect(getCachedEnvStatus()).toBeNull();
  });
});
