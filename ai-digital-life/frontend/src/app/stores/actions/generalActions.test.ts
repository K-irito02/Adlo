import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAppStore } from '../slicedStore';
import type { AppPreferencePatch } from '../../../shared/ipc-types.generated';

// Mock themeController 依赖（updatePreferences 成功路径会调用）
vi.mock('@utils/theme', () => ({
  themeController: {
    setTheme: vi.fn(),
    hydrate: vi.fn(),
  },
}));

// Mock resolveCurrentTheme（依赖 window.matchMedia，jsdom 不提供）
vi.mock('@shared/resolveTheme', () => ({
  resolveCurrentTheme: vi.fn(() => 'light'),
}));

// window.digitalLife 全局 mock
const mockUpdatePreferences = vi.fn();

function setupWindowDigitalLife() {
  (window as unknown as { digitalLife: unknown }).digitalLife = {
    app: {
      updatePreferences: mockUpdatePreferences,
      getModelHealth: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    },
  };
}

describe('updatePreferences action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupWindowDigitalLife();
    // 重置 store 状态
    useAppStore.setState({
      error: undefined,
      isFetching: {},
    });
  });

  afterEach(() => {
    useAppStore.setState({
      error: undefined,
      isFetching: {},
    });
  });

  it('sets isFetching[updatePreferences] during call', async () => {
    let resolvePromise: (value: { ok: true; data: unknown }) => void;
    mockUpdatePreferences.mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      })
    );

    const store = useAppStore.getState();
    const promise = store.updatePreferences({ language: 'en-US' } as AppPreferencePatch);
    expect(useAppStore.getState().isFetching['updatePreferences']).toBe(true);

    resolvePromise!({
      ok: true,
      data: {
        config: { themeMode: 'system' },
        recentLogs: [],
        currentWorkspace: null,
        appName: 'test',
        version: '0.0.0',
      },
    });
    await promise;
    expect(useAppStore.getState().isFetching['updatePreferences']).toBe(false);
  });

  it('captures typed error on failure and clears isFetching', async () => {
    mockUpdatePreferences.mockResolvedValue({
      ok: false,
      error: { code: 'CONFIG_ERROR', message: 'Invalid preference' },
    });

    const store = useAppStore.getState();
    await store.updatePreferences({ language: 'invalid' } as AppPreferencePatch);

    const error = useAppStore.getState().error;
    expect(error).toContain('[CONFIG_ERROR]');
    expect(error).toContain('Invalid preference');
    expect(useAppStore.getState().isFetching['updatePreferences']).toBe(false);
  });

  it('clears error on entry', async () => {
    mockUpdatePreferences.mockResolvedValue({
      ok: true,
      data: {
        config: { themeMode: 'system' },
        recentLogs: [],
        currentWorkspace: null,
        appName: 'test',
        version: '0.0.0',
      },
    });

    const store = useAppStore.getState();
    store.setError('previous error');
    expect(useAppStore.getState().error).toBe('previous error');

    await store.updatePreferences({ language: 'en-US' } as AppPreferencePatch);
    expect(useAppStore.getState().error).toBeUndefined();
  });

  it('does not re-enter when isFetching is already true', async () => {
    useAppStore.setState({ isFetching: { updatePreferences: true } });
    const store = useAppStore.getState();
    await store.updatePreferences({ language: 'en-US' } as AppPreferencePatch);
    // 不应调用 mock（防重入）
    expect(mockUpdatePreferences).not.toHaveBeenCalled();
  });
});
