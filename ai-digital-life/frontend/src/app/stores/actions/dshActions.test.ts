import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAppStore } from '../slicedStore';

// 真实 store + 最小 dsh 桥：验证后台同步 silent 语义（失败不记全局错误卡）。
const mockGetSourceStatus = vi.fn();
const mockTestSource = vi.fn();

function setupBridge() {
  (window as unknown as { digitalLife: unknown }).digitalLife = {
    dsh: {
      getSourceStatus: (...args: unknown[]) => mockGetSourceStatus(...args),
      testSource: (...args: unknown[]) => mockTestSource(...args),
    },
  };
}

const NETWORK_FAILURE = {
  ok: false,
  error: { code: 'NETWORK_ERROR', message: 'Failed to fetch' },
} as const;

describe('dsh background sync silence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupBridge();
    useAppStore.setState({ errorToasts: [], sourceStatus: null });
  });

  afterEach(() => {
    useAppStore.setState({ errorToasts: [], sourceStatus: null });
    (window as unknown as { digitalLife?: unknown }).digitalLife = undefined;
  });

  it('fetchSourceStatus 非 silent：失败记全局错误卡（旧语义保留）', async () => {
    mockGetSourceStatus.mockResolvedValue(NETWORK_FAILURE);
    const ok = await useAppStore.getState().fetchSourceStatus();
    expect(ok).toBe(false);
    expect(useAppStore.getState().errorToasts).toHaveLength(1);
  });

  it('fetchSourceStatus silent：失败不记全局错误卡（挂载后台同步）', async () => {
    mockGetSourceStatus.mockResolvedValue(NETWORK_FAILURE);
    const ok = await useAppStore.getState().fetchSourceStatus(true);
    expect(ok).toBe(false);
    expect(useAppStore.getState().errorToasts).toHaveLength(0);
  });

  it('testSource 非 silent：失败记全局错误卡（用户主动测试保留）', async () => {
    mockTestSource.mockResolvedValue(NETWORK_FAILURE);
    const result = await useAppStore.getState().testSource('https://registry.npmjs.org');
    expect(result).toBeNull();
    expect(useAppStore.getState().errorToasts).toHaveLength(1);
  });

  it('testSource silent：失败不记全局错误卡（自动检测后台实测）', async () => {
    mockTestSource.mockResolvedValue(NETWORK_FAILURE);
    const result = await useAppStore.getState().testSource('https://registry.npmjs.org', true);
    expect(result).toBeNull();
    expect(useAppStore.getState().errorToasts).toHaveLength(0);
  });

  it('silent 同步不清除用户已有的错误卡（只读不碰）', async () => {
    // 先一次主动失败留下一张 dsh 错误卡，再跑 silent 同步：旧卡必须保留。
    mockGetSourceStatus.mockResolvedValue(NETWORK_FAILURE);
    await useAppStore.getState().fetchSourceStatus();
    expect(useAppStore.getState().errorToasts).toHaveLength(1);
    const detail = useAppStore.getState().errorToasts[0].detail;
    await useAppStore.getState().fetchSourceStatus(true);
    const toasts = useAppStore.getState().errorToasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].detail).toBe(detail);
    // testSource 同理。
    mockTestSource.mockResolvedValue(NETWORK_FAILURE);
    await useAppStore.getState().testSource('https://registry.npmjs.org', true);
    expect(useAppStore.getState().errorToasts).toHaveLength(1);
  });
});
