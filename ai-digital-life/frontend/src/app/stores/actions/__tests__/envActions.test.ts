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
  uninstallEnvDep: (dep: string, version?: string) => Promise<boolean>;
  setEnvCustomPath: (dep: string, path: string) => Promise<boolean>;
  recheckEnv: (dep?: string) => Promise<boolean>;
  pollEnvTaskWhileRunning: (options?: { suppressInitialError?: boolean }) => () => void;
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
    dataDir: 'C:/data-root',
    dshReady: false,
  };
}

const mockGetStatus = vi.fn();
const mockInstall = vi.fn();
const mockUninstall = vi.fn();
const mockSelectSource = vi.fn();
const mockSetCustomPath = vi.fn();
const mockRecheck = vi.fn();
const mockShowToast = vi.fn((_message: string, _type?: string): string => 'toast-id');

function setupBridge() {
  (window as unknown as { digitalLife: unknown }).digitalLife = {
    env: {
      getStatus: (...args: unknown[]) => mockGetStatus(...args),
      install: (...args: unknown[]) => mockInstall(...args),
      uninstall: (...args: unknown[]) => mockUninstall(...args),
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
      | 'uninstallEnvDep'
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

  it('返回的运行中任务保持 busy（不得被非静默刷新提前解锁）', async () => {
    const running = fakeStatus();
    running.task = {
      kind: 'env-node-install',
      version: 'node 24.22.1',
      phase: 'installing',
      percent: null,
      done: 1,
      total: 10,
      cancellable: true,
    };
    mockGetStatus.mockResolvedValue({ ok: true, data: running });
    const store = makeStore();
    await expect(store.getState().fetchEnvStatus()).resolves.toBe(true);
    expect(store.getState().envStatus?.task?.kind).toBe('env-node-install');
    expect(store.getState().envBusy).toBe(true);
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
    expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Node.js'), 'error');
    expect(store.getState().envStatus).toBe(old);
    expect(store.getState().envBusy).toBe(false);
  });

  it('install 成功后启动轮询：task 变 null 即停、终态刷新 + toast', async () => {
    vi.useFakeTimers();
    const running = fakeStatus();
    running.task = {
      kind: 'env-node-install',
      version: 'node 24.22.1',
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
    expect(String(successCalls[0][0])).toContain('Node.js');
    expect(String(successCalls[0][0])).toContain('24.22.1');
    // task.version 已含 "node " 前缀：toast 插值后不得重复成 "node node"。
    expect(String(successCalls[0][0])).not.toContain('Node.js node');
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
      version: 'git 2.52.0',
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

  it('持续失败熔断：N 次失败后停轮询、清本地 task、busy 复位、单次 error toast', async () => {
    vi.useFakeTimers();
    const running = fakeStatus();
    running.task = {
      kind: 'env-node-install',
      version: 'node 24.22.1',
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
    expect(store.getState().envStatus?.task).toBeNull();
    expect(store.getState().envBusy).toBe(false);
    expect(mockShowToast).toHaveBeenCalledTimes(1);
    expect(mockShowToast).toHaveBeenCalledWith(expect.any(String), 'error');
    const callsAfterCap = mockGetStatus.mock.calls.length;
    await vi.advanceTimersByTimeAsync(ENV_POLL_INTERVAL_MS * 2);
    expect(mockGetStatus.mock.calls.length).toBe(callsAfterCap);
  });

  it('启动快照已带 error：清本地 task、busy 复位、不重放 toast/tick', async () => {
    vi.useFakeTimers();
    const stale = fakeStatus();
    stale.task = {
      kind: 'env-node-install',
      version: 'node 24.22.1',
      phase: 'installing',
      percent: null,
      done: 0,
      total: 0,
      cancellable: true,
      error: 'old failure',
    };
    const store = makeStore();
    store.getState().setEnvStatus(stale);
    store.getState().setEnvBusy(true);
    store.getState().pollEnvTaskWhileRunning();
    expect(store.getState().envStatus?.task).toBeNull();
    expect(store.getState().envBusy).toBe(false);
    expect(mockShowToast).not.toHaveBeenCalled();
    expect(store.getState().errorToasts).toEqual([]);
    await vi.advanceTimersByTimeAsync(ENV_POLL_INTERVAL_MS * 2);
    expect(mockGetStatus).not.toHaveBeenCalled();
  });

  it('状态未知时仍启动轮询：首个 tick 取回状态并采用任务', async () => {
    vi.useFakeTimers();
    const running = fakeStatus();
    running.task = {
      kind: 'env-node-install',
      version: 'node 24.22.1',
      phase: 'installing',
      percent: null,
      done: 1,
      total: 10,
      cancellable: true,
    };
    mockGetStatus.mockResolvedValue({ ok: true, data: running });
    const store = makeStore();
    expect(store.getState().envStatus).toBeNull();
    // 未知状态 + 操作进行中（install 已置 busy）才轮询；空闲（task null + busy false）
    // 不启动（N-03）。
    store.getState().setEnvBusy(true);
    const cleanup = store.getState().pollEnvTaskWhileRunning();
    await vi.advanceTimersByTimeAsync(ENV_POLL_INTERVAL_MS);
    expect(mockGetStatus).toHaveBeenCalledTimes(1);
    expect(store.getState().envStatus?.task?.kind).toBe('env-node-install');
    cleanup();
  });

  it('安装后的静默刷新失败不阻断轮询（解耦）', async () => {
    vi.useFakeTimers();
    const finished = fakeStatus();
    mockInstall.mockResolvedValue({ ok: true, data: true });
    mockGetStatus
      .mockRejectedValueOnce(new Error('refresh boom'))
      .mockResolvedValue({ ok: true, data: finished });
    const store = makeStore();
    await expect(store.getState().installEnvDep('node')).resolves.toBe(true);
    // 第一次调用是安装后的静默刷新（失败）。
    expect(mockGetStatus).toHaveBeenCalledTimes(1);
    expect(store.getState().envStatus).toBeNull();
    await vi.advanceTimersByTimeAsync(ENV_POLL_INTERVAL_MS);
    // 轮询仍然启动并取回状态，不会因刷新失败而停摆。
    expect(mockGetStatus).toHaveBeenCalledTimes(2);
    expect(store.getState().envStatus).not.toBeNull();
  });

  it('静默刷新返回 !ok 且旧状态非空：仍启动轮询并取回运行中任务（R1-05）', async () => {
    vi.useFakeTimers();
    const old = fakeStatus();
    const running = fakeStatus();
    running.task = {
      kind: 'env-node-install',
      version: 'node 24.22.1',
      phase: 'installing',
      percent: null,
      done: 1,
      total: 10,
      cancellable: true,
    };
    mockInstall.mockResolvedValue({ ok: true, data: { started: true } });
    mockGetStatus
      .mockResolvedValueOnce({
        ok: false,
        error: { code: 'NETWORK_ERROR', message: 'refresh boom' },
      })
      .mockResolvedValue({ ok: true, data: running });
    const store = makeStore();
    store.getState().setEnvStatus(old);
    await expect(store.getState().installEnvDep('node')).resolves.toBe(true);
    // refresh !ok：旧快照保留，busy 仍为 true（install 未解锁）。
    expect(store.getState().envStatus).toBe(old);
    expect(store.getState().envBusy).toBe(true);
    await vi.advanceTimersByTimeAsync(ENV_POLL_INTERVAL_MS);
    expect(mockGetStatus).toHaveBeenCalledTimes(2);
    expect(store.getState().envStatus?.task?.kind).toBe('env-node-install');
  });

  it('变异窗口内的新失败必须上报（refresh 已写回 error 也不得静默吞掉，N-01）', async () => {
    vi.useFakeTimers();
    const failed = fakeStatus();
    failed.node = depState(null, false);
    failed.node.effective = 'none';
    failed.node.path = null;
    failed.task = {
      kind: 'env-node-install',
      version: 'node 24.22.1',
      phase: 'installing',
      percent: null,
      done: 0,
      total: 0,
      cancellable: true,
      error: 'download failed',
    };
    mockInstall.mockResolvedValue({ ok: true, data: { started: true } });
    // 第一次 refresh 已写回失败任务；后续 tick 仍是同一失败（后端保留到下一任务）。
    mockGetStatus.mockResolvedValue({ ok: true, data: failed });
    const store = makeStore();
    await expect(store.getState().installEnvDep('node')).resolves.toBe(true);
    expect(store.getState().envStatus?.task?.error).toBe('download failed');
    await vi.advanceTimersByTimeAsync(ENV_POLL_INTERVAL_MS);
    // 变异前无失败（initialErrorKey=null）→ 本次失败必须 toast + 错误卡各一次。
    expect(store.getState().errorToasts).toHaveLength(1);
    const errorToasts = mockShowToast.mock.calls.filter(([, type]) => type === 'error');
    expect(errorToasts).toHaveLength(1);
    expect(String(errorToasts[0][0])).toContain('Node.js');
    expect(store.getState().envStatus?.task).toBeNull();
    expect(store.getState().envBusy).toBe(false);
    const callsAfterStop = mockGetStatus.mock.calls.length;
    await vi.advanceTimersByTimeAsync(ENV_POLL_INTERVAL_MS * 2);
    expect(mockGetStatus.mock.calls.length).toBe(callsAfterStop);
  });

  it('空闲（task null 且 busy false）不启动轮询（N-03）', async () => {
    vi.useFakeTimers();
    const store = makeStore();
    store.getState().setEnvStatus(fakeStatus());
    store.getState().pollEnvTaskWhileRunning();
    await vi.advanceTimersByTimeAsync(ENV_POLL_INTERVAL_MS * 2);
    expect(mockGetStatus).not.toHaveBeenCalled();
  });
  it('相同错误文本的连续重试都必须上报（N-F2）', async () => {
    vi.useFakeTimers();
    const failed = fakeStatus();
    failed.node = { ...depState(null, false), effective: 'none', path: null };
    const error = 'same network error';
    failed.task = {
      kind: 'env-node-install',
      version: 'node 24.22.1',
      phase: 'installing',
      percent: null,
      done: 0,
      total: 0,
      cancellable: true,
      error,
    };
    mockInstall.mockResolvedValue({ ok: true, data: { started: true } });
    mockGetStatus.mockResolvedValue({ ok: true, data: failed });
    const errorToasts = () => mockShowToast.mock.calls.filter(([, type]) => type === 'error');
    const store = makeStore();
    // 采用启动前已存在的失败快照作为第一次重试的起点。
    store.getState().setEnvStatus(failed);
    await store.getState().installEnvDep('node');
    await vi.advanceTimersByTimeAsync(ENV_POLL_INTERVAL_MS);
    expect(errorToasts()).toHaveLength(1);

    // 第二次重试仍以完全相同的文本失败：action-owned 轮询不得把它当作陈旧快照吞掉。
    store.getState().setEnvStatus(failed);
    await store.getState().installEnvDep('node');
    await vi.advanceTimersByTimeAsync(ENV_POLL_INTERVAL_MS);
    expect(errorToasts()).toHaveLength(2);
  });

  it('空闲调用不取消已存在的活跃轮询（N-F3）', async () => {
    vi.useFakeTimers();
    const running = fakeStatus();
    running.task = {
      kind: 'env-node-install',
      version: 'node 24.22.1',
      phase: 'installing',
      percent: null,
      done: 1,
      total: 10,
      cancellable: true,
    };
    mockGetStatus.mockResolvedValue({ ok: true, data: running });
    const store = makeStore();
    store.getState().setEnvStatus(running);
    const cleanup = store.getState().pollEnvTaskWhileRunning();
    // 查看路径在快照变空且 busy=false 时再次调用：不得停掉活跃轮询。
    store.getState().setEnvStatus(fakeStatus());
    store.getState().setEnvBusy(false);
    store.getState().pollEnvTaskWhileRunning();
    await vi.advanceTimersByTimeAsync(ENV_POLL_INTERVAL_MS);
    expect(mockGetStatus).toHaveBeenCalledTimes(1);
    cleanup();
  });
});

describe('envActions uninstallEnvDep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupBridge();
  });

  afterEach(() => {
    (window as unknown as { digitalLife?: unknown }).digitalLife = undefined;
    vi.useRealTimers();
  });

  it('uninstall failure surfaces uninstall toast and keeps old status', async () => {
    const old = fakeStatus();
    mockUninstall.mockResolvedValue({
      ok: false,
      error: { code: 'INVALID_INPUT', message: 'not-managed' },
    });
    const store = makeStore();
    store.getState().setEnvStatus(old);
    const ok = await store.getState().uninstallEnvDep('git', '2.52.0');
    expect(ok).toBe(false);
    expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Git'), 'error');
    expect(store.getState().envStatus).toBe(old);
    expect(store.getState().envBusy).toBe(false);
  });

  it('uninstall success polls the uninstall task to completion', async () => {
    vi.useFakeTimers();
    const running = fakeStatus();
    running.task = {
      kind: 'env-git-uninstall',
      version: '2.52.0',
      phase: 'removing',
      percent: null,
      done: 0,
      total: 0,
      cancellable: false,
    };
    const finished = fakeStatus();
    mockUninstall.mockResolvedValue({ ok: true, data: { started: true } });
    mockGetStatus
      .mockResolvedValueOnce({ ok: true, data: running })
      .mockResolvedValue({ ok: true, data: finished });
    const store = makeStore();
    const ok = await store.getState().uninstallEnvDep('git', '2.52.0');
    expect(ok).toBe(true);
    expect(mockUninstall).toHaveBeenCalledWith('git', '2.52.0');
    await vi.advanceTimersByTimeAsync(ENV_POLL_INTERVAL_MS);
    expect(store.getState().envStatus?.task).toBeNull();
    expect(store.getState().envBusy).toBe(false);
    // 卸载成功不复用安装成功文案（“已安装 …”对卸载是错误反馈）。
    expect(mockShowToast).not.toHaveBeenCalledWith(expect.any(String), 'success');
    const callsAfterStop = mockGetStatus.mock.calls.length;
    await vi.advanceTimersByTimeAsync(ENV_POLL_INTERVAL_MS * 2);
    expect(mockGetStatus.mock.calls.length).toBe(callsAfterStop);
  });

  it('卸载后的静默刷新 !ok：仍启动轮询跟进新任务（R1-05）', async () => {
    vi.useFakeTimers();
    const old = fakeStatus();
    const running = fakeStatus();
    running.task = {
      kind: 'env-git-uninstall',
      version: '2.52.0',
      phase: 'removing',
      percent: null,
      done: 0,
      total: 0,
      cancellable: false,
    };
    mockUninstall.mockResolvedValue({ ok: true, data: { started: true } });
    mockGetStatus
      .mockResolvedValueOnce({
        ok: false,
        error: { code: 'NETWORK_ERROR', message: 'refresh boom' },
      })
      .mockResolvedValue({ ok: true, data: running });
    const store = makeStore();
    store.getState().setEnvStatus(old);
    await expect(store.getState().uninstallEnvDep('git', '2.52.0')).resolves.toBe(true);
    expect(store.getState().envStatus).toBe(old);
    expect(store.getState().envBusy).toBe(true);
    await vi.advanceTimersByTimeAsync(ENV_POLL_INTERVAL_MS);
    expect(mockGetStatus).toHaveBeenCalledTimes(2);
    expect(store.getState().envStatus?.task?.kind).toBe('env-git-uninstall');
  });

  it('task.error 终止卸载轮询：busy 复位 + 卸载域 error toast，不拖到 10 分钟上限', async () => {
    vi.useFakeTimers();
    const running = fakeStatus();
    running.task = {
      kind: 'env-git-uninstall',
      version: '2.52.0',
      phase: 'removing',
      percent: null,
      done: 0,
      total: 0,
      cancellable: false,
    };
    const failed = fakeStatus();
    failed.task = {
      kind: 'env-git-uninstall',
      version: '2.52.0',
      phase: 'removing',
      percent: null,
      done: 0,
      total: 0,
      cancellable: false,
      error: 'access denied',
    };
    mockUninstall.mockResolvedValue({ ok: true, data: { started: true } });
    mockGetStatus
      .mockResolvedValueOnce({ ok: true, data: running })
      .mockResolvedValue({ ok: true, data: failed });
    const store = makeStore();
    await store.getState().uninstallEnvDep('git', '2.52.0');
    await vi.advanceTimersByTimeAsync(ENV_POLL_INTERVAL_MS);
    expect(store.getState().envBusy).toBe(false);
    expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Git'), 'error');
    const callsAfterStop = mockGetStatus.mock.calls.length;
    await vi.advanceTimersByTimeAsync(ENV_POLL_INTERVAL_MS * 2);
    expect(mockGetStatus.mock.calls.length).toBe(callsAfterStop);
  });

  it('task.error also terminates install polling (existing hang fix)', async () => {
    vi.useFakeTimers();
    const running = fakeStatus();
    running.task = {
      kind: 'env-node-install',
      version: 'node 24.22.1',
      phase: 'installing',
      percent: null,
      done: 0,
      total: 0,
      cancellable: true,
    };
    const failed = fakeStatus();
    failed.task = {
      ...running.task,
      error: 'download failed',
    };
    mockInstall.mockResolvedValue({ ok: true, data: true });
    mockGetStatus
      .mockResolvedValueOnce({ ok: true, data: running })
      .mockResolvedValue({ ok: true, data: failed });
    const store = makeStore();
    await store.getState().installEnvDep('node');
    await vi.advanceTimersByTimeAsync(ENV_POLL_INTERVAL_MS);
    expect(store.getState().envBusy).toBe(false);
    expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Node.js'), 'error');
    const callsAfterStop = mockGetStatus.mock.calls.length;
    await vi.advanceTimersByTimeAsync(ENV_POLL_INTERVAL_MS * 2);
    expect(mockGetStatus.mock.calls.length).toBe(callsAfterStop);
  });

  it('失败安装任务终态化：本地清 task 停轮询、busy 复位、单次 error toast', async () => {
    vi.useFakeTimers();
    const running = fakeStatus();
    running.node = { ...depState(null, false), effective: 'none', path: null };
    running.task = {
      kind: 'env-node-install',
      version: 'node 24.22.1',
      phase: 'installing',
      percent: null,
      done: 0,
      total: 0,
      cancellable: true,
    };
    const failed = fakeStatus();
    failed.node = running.node;
    failed.task = { ...running.task, error: 'download failed' };
    mockInstall.mockResolvedValue({ ok: true, data: true });
    mockGetStatus
      .mockResolvedValueOnce({ ok: true, data: running })
      .mockResolvedValue({ ok: true, data: failed });
    const store = makeStore();
    await store.getState().installEnvDep('node');
    expect(store.getState().envStatus?.task).not.toBeNull();
    await vi.advanceTimersByTimeAsync(ENV_POLL_INTERVAL_MS);
    // 失败信息只留在 toast/错误卡：本地 task 清空，行不再显示“安装中”。
    expect(store.getState().envStatus?.task).toBeNull();
    expect(store.getState().envBusy).toBe(false);
    const errorToasts = mockShowToast.mock.calls.filter(([, type]) => type === 'error');
    expect(errorToasts).toHaveLength(1);
    expect(String(errorToasts[0][0])).toContain('Node.js');
    const callsAfterStop = mockGetStatus.mock.calls.length;
    await vi.advanceTimersByTimeAsync(ENV_POLL_INTERVAL_MS * 2);
    expect(mockGetStatus.mock.calls.length).toBe(callsAfterStop);
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
