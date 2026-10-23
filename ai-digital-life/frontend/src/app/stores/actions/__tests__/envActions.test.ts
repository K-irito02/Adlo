import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createStore } from 'zustand';
import {
  createEnvActions,
  ENV_POLL_INTERVAL_MS,
  ENV_POLL_MAX_CONSECUTIVE_FAILURES,
} from '../envActions';
import type { EnvStatus } from '../../../../shared/ipc/env';

/** envActions 依赖的最小 store 表面（其余动作字段以 unknown 桩代） */
interface EnvTestStore {
  envStatus: EnvStatus | null;
  envBusy: boolean;
  envWizardDone: boolean;
  envWizardSkippedAt: number | null;
  setEnvStatus: (status: EnvStatus | null) => void;
  setEnvBusy: (busy: boolean) => void;
  setEnvWizardDone: (done: boolean) => void;
  setEnvWizardSkippedAt: (at: number | null) => void;
  errorToasts: { code: string; detail: string; scope?: string }[];
  reportError: (code: string, detail: string, scope?: string) => string;
  clearErrorToasts: (scope?: string) => void;
  appInfo: null;
  showToast: (message: string, type?: string) => string;
  fetchEnvStatus: (silent?: boolean) => Promise<boolean>;
  selectEnvSource: (dep: string, mode: 'auto' | 'system' | 'host') => Promise<boolean>;
  installEnvDep: (dep: string, version?: string) => Promise<boolean>;
  setEnvCustomPath: (dep: string, path: string) => Promise<boolean>;
  recheckEnv: (dep?: string) => Promise<boolean>;
  pollEnvTaskWhileRunning: () => () => void;
}

function depState(version: string | null, meets: boolean) {
  return {
    mode: 'auto' as const,
    effective: 'host' as const,
    origin: 'path' as const,
    installedVersion: version,
    baselineVersion: '1.0.0',
    meetsBaseline: meets,
    path: version ? `C:/hosted/${version}` : null,
  };
}

function fakeStatus(): EnvStatus {
  return {
    node: depState('24.22.1', true),
    git: depState('2.52.0', true),
    bash: depState('5.2.21', true),
    webview2: {
      mode: 'auto',
      effective: 'system',
      origin: 'registry',
      installedVersion: '140.0.3485.94',
      baselineVersion: '140.0.0.0',
      meetsBaseline: true,
      path: null,
    },
    adlserver: depState('0.1.0', true),
    netprobe: { registryOk: true, registryLatencyMs: 12, ciTokenConfigured: false },
    task: null,
    dshReady: false,
  };
}

const mockGetStatus = vi.fn();
const mockInstall = vi.fn();
const mockSelectSource = vi.fn();
const mockSetCustomPath = vi.fn();
const mockRecheck = vi.fn();
const mockShowToast = vi.fn((_message: string, _type?: string): string => 'toast-id');

function setupBridge() {
  (window as unknown as { digitalLife: unknown }).digitalLife = {
    env: {
      getStatus: (...args: unknown[]) => mockGetStatus(...args),
      install: (...args: unknown[]) => mockInstall(...args),
      selectSource: (...args: unknown[]) => mockSelectSource(...args),
      setCustomPath: (...args: unknown[]) => mockSetCustomPath(...args),
      recheck: (...args: unknown[]) => mockRecheck(...args),
    },
  };
}

function makeStore() {
  const store = createStore<EnvTestStore>((set, get) => {
    const envActions = createEnvActions(set as never, () => get() as never) as unknown as Pick<
      EnvTestStore,
      | 'fetchEnvStatus'
      | 'selectEnvSource'
      | 'installEnvDep'
      | 'setEnvCustomPath'
      | 'recheckEnv'
      | 'pollEnvTaskWhileRunning'
    >;
    return {
      envStatus: null,
      envBusy: false,
      envWizardDone: false,
      envWizardSkippedAt: null,
      setEnvStatus: (status) => set({ envStatus: status }),
      setEnvBusy: (busy) => set({ envBusy: busy }),
      setEnvWizardDone: (done) => set({ envWizardDone: done }),
      setEnvWizardSkippedAt: (at) => set({ envWizardSkippedAt: at }),
      errorToasts: [],
      reportError: (code, detail, scope) => {
        set((s) => ({ errorToasts: [...s.errorToasts, { code, detail, scope }] }));
        return 'err';
      },
      clearErrorToasts: (scope) => {
        if (scope === undefined) {
          set({ errorToasts: [] });
          return;
        }
        set((s) => ({ errorToasts: s.errorToasts.filter((t) => t.scope !== scope) }));
      },
      appInfo: null,
      showToast: (message: string, type?: string) => mockShowToast(message, type),
      ...envActions,
    };
  });
  return store;
}

describe('envActions fetchEnvStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupBridge();
  });

  afterEach(() => {
    (window as unknown as { digitalLife?: unknown }).digitalLife = undefined;
  });

  it('fetchEnvStatus writes status and clears pending on ok', async () => {
    mockGetStatus.mockResolvedValue({ ok: true, data: fakeStatus() });
    const store = makeStore();
    const ok = await store.getState().fetchEnvStatus();
    expect(ok).toBe(true);
    expect(store.getState().envStatus?.dshReady).toBe(false);
    expect(store.getState().envBusy).toBe(false);
    expect(store.getState().errorToasts).toEqual([]);
  });

  it('fetchEnvStatus silent 失败不记全局错误卡', async () => {
    mockGetStatus.mockResolvedValue({
      ok: false,
      error: { code: 'NETWORK_ERROR', message: 'boom' },
    });
    const store = makeStore();
    const ok = await store.getState().fetchEnvStatus(true);
    expect(ok).toBe(false);
    expect(store.getState().errorToasts).toEqual([]);
    expect(store.getState().envStatus).toBeNull();
  });

  it('桥本身抛错：不向上透出，按失败返回（非 silent 记卡）', async () => {
    mockGetStatus.mockRejectedValue(new Error('bridge gone'));
    const store = makeStore();
    await expect(store.getState().fetchEnvStatus()).resolves.toBe(false);
    expect(store.getState().errorToasts).toHaveLength(1);
    expect(store.getState().envStatus).toBeNull();
  });
});

describe('envActions installEnvDep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupBridge();
  });

  afterEach(() => {
    (window as unknown as { digitalLife?: unknown }).digitalLife = undefined;
    vi.useRealTimers();
  });

  it('install failure surfaces toast and keeps old status', async () => {
    const old = fakeStatus();
    mockInstall.mockResolvedValue({
      ok: false,
      error: { code: 'NETWORK_ERROR', message: 'install boom' },
    });
    const store = makeStore();
    store.getState().setEnvStatus(old);
    const ok = await store.getState().installEnvDep('node');
    expect(ok).toBe(false);
    expect(mockShowToast).toHaveBeenCalledWith(expect.any(String), 'error');
    // Task 3：安装失败走 environment 域文案（含 dep），不再是通用 operationFailed。
    expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('node'), 'error');
    expect(store.getState().envStatus).toBe(old);
    expect(store.getState().envBusy).toBe(false);
  });

  it('install 成功后启动轮询：task 变 null 即停、终态刷新 + toast', async () => {
    vi.useFakeTimers();
    const running = fakeStatus();
    running.task = {
      kind: 'env-node-install',
      version: '24.22.1',
      phase: 'installing',
      // null 表示总量未知：轮询与渲染都必须透传，不得按 0 处理。
      percent: null,
      done: 3,
      total: 10,
      cancellable: true,
    };
    const finished = fakeStatus();
    mockInstall.mockResolvedValue({ ok: true, data: true });
    mockGetStatus
      .mockResolvedValueOnce({ ok: true, data: running })
      .mockResolvedValue({ ok: true, data: finished });
    const store = makeStore();
    const ok = await store.getState().installEnvDep('node');
    expect(ok).toBe(true);
    // install 后的静默刷新已写入 running 快照（含 percent: null 透传）。
    expect(store.getState().envStatus?.task?.percent).toBeNull();
    // 推进一个轮询周期：拿到终态（task null）即停。
    await vi.advanceTimersByTimeAsync(ENV_POLL_INTERVAL_MS);
    expect(store.getState().envStatus?.task).toBeNull();
    expect(store.getState().envBusy).toBe(false);
    expect(mockShowToast).toHaveBeenCalledWith(expect.any(String), 'success');
    // Task 3：成功 toast 用 environment 域文案（含 dep + version），不再复用 dsh.dshInstallSuccess。
    const successCalls = mockShowToast.mock.calls.filter(([, type]) => type === 'success');
    expect(successCalls).toHaveLength(1);
    expect(String(successCalls[0][0])).toContain('node');
    expect(String(successCalls[0][0])).toContain('24.22.1');
    const callsAfterStop = mockGetStatus.mock.calls.length;
    // 已停止：再推进两个周期也不再拉取。
    await vi.advanceTimersByTimeAsync(ENV_POLL_INTERVAL_MS * 2);
    expect(mockGetStatus.mock.calls.length).toBe(callsAfterStop);
  });

  it('poll 清除契约：调用方 unmount 清除后不再轮询', async () => {
    vi.useFakeTimers();
    const running = fakeStatus();
    running.task = {
      kind: 'env-git-install',
      version: '2.52.0',
      phase: 'installing',
      percent: 50,
      done: 5,
      total: 10,
      cancellable: true,
    };
    mockGetStatus.mockResolvedValue({ ok: true, data: running });
    const store = makeStore();
    store.getState().setEnvStatus(running);
    const cleanup = store.getState().pollEnvTaskWhileRunning();
    await vi.advanceTimersByTimeAsync(ENV_POLL_INTERVAL_MS);
    expect(mockGetStatus).toHaveBeenCalled();
    cleanup();
    const callsAfterCleanup = mockGetStatus.mock.calls.length;
    await vi.advanceTimersByTimeAsync(ENV_POLL_INTERVAL_MS * 2);
    expect(mockGetStatus.mock.calls.length).toBe(callsAfterCleanup);
  });

  it('持续失败熔断：N 次失败后停轮询、busy 复位、单次 error toast', async () => {
    vi.useFakeTimers();
    const running = fakeStatus();
    running.task = {
      kind: 'env-node-install',
      version: '24.22.1',
      phase: 'installing',
      percent: null,
      done: 3,
      total: 10,
      cancellable: true,
    };
    mockGetStatus.mockRejectedValue(new Error('tick boom'));
    const store = makeStore();
    store.getState().setEnvStatus(running);
    store.getState().setEnvBusy(true);
    store.getState().pollEnvTaskWhileRunning();
    await vi.advanceTimersByTimeAsync(ENV_POLL_INTERVAL_MS * ENV_POLL_MAX_CONSECUTIVE_FAILURES);
    expect(store.getState().envBusy).toBe(false);
    expect(mockShowToast).toHaveBeenCalledTimes(1);
    expect(mockShowToast).toHaveBeenCalledWith(expect.any(String), 'error');
    const callsAfterCap = mockGetStatus.mock.calls.length;
    await vi.advanceTimersByTimeAsync(ENV_POLL_INTERVAL_MS * 2);
    expect(mockGetStatus.mock.calls.length).toBe(callsAfterCap);
  });
});

describe('envActions mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupBridge();
  });

  afterEach(() => {
    (window as unknown as { digitalLife?: unknown }).digitalLife = undefined;
  });

  it('selectEnvSource 成功后静默刷新状态', async () => {
    mockSelectSource.mockResolvedValue({ ok: true, data: true });
    mockGetStatus.mockResolvedValue({ ok: true, data: fakeStatus() });
    const store = makeStore();
    const ok = await store.getState().selectEnvSource('node', 'system');
    expect(ok).toBe(true);
    expect(mockSelectSource).toHaveBeenCalledWith('node', 'system');
    expect(store.getState().envStatus?.dshReady).toBe(false);
  });

  it('setEnvCustomPath 失败：toast + 状态不动', async () => {
    const old = fakeStatus();
    mockSetCustomPath.mockResolvedValue({
      ok: false,
      error: { code: 'NETWORK_ERROR', message: 'path boom' },
    });
    const store = makeStore();
    store.getState().setEnvStatus(old);
    const ok = await store.getState().setEnvCustomPath('node', 'C:/custom/node.exe');
    expect(ok).toBe(false);
    expect(mockShowToast).toHaveBeenCalledWith(expect.any(String), 'error');
    expect(store.getState().envStatus).toBe(old);
  });

  it('recheckEnv 透传 dep 并刷新', async () => {
    mockRecheck.mockResolvedValue({ ok: true, data: true });
    mockGetStatus.mockResolvedValue({ ok: true, data: fakeStatus() });
    const store = makeStore();
    const ok = await store.getState().recheckEnv('git');
    expect(ok).toBe(true);
    expect(mockRecheck).toHaveBeenCalledWith('git');
    expect(store.getState().envStatus).not.toBeNull();
  });
});
