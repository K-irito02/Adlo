import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createStore } from 'zustand';
import { createDshActions, shouldRefreshDshTab } from '../dshActions';
import type { DshOpenResult } from '../../../../shared/ipc/dsh';

/** dshActions 依赖的最小 store 表面（其余动作字段以 unknown 桩代） */
interface DshTestStore {
  versionStatus: unknown;
  errorToasts: { code: string; detail: string; scope?: string }[];
  reportError: (code: string, detail: string, scope?: string) => string;
  clearErrorToasts: (scope?: string) => void;
  setDshVersionStatus: (status: unknown) => void;
  isTauri: boolean;
  siblingWebviewNonce: number;
  bumpSiblingWebviewNonce: () => void;
  fetchDshVersionStatus: () => Promise<boolean>;
  openDsh: (options?: { centerTabId?: string }) => Promise<DshOpenResult | null>;
  ensureDshUrl: (t?: {
    dshRecovering?: string;
    dshStarting?: string;
  }) => Promise<DshOpenResult | null>;
  resolveDshPortConflict: (accept: boolean) => void;
  dismissDshRecoveryToast: () => void;
  dshPortConflict: unknown;
  setDshPortConflict: (info: unknown) => void;
  dshRecoveryToastId: string | null;
  setDshRecoveryToastId: (id: string | null) => void;
  restartDsh: () => Promise<{ restarted: boolean; url: string | null; failed: boolean }>;
  updateDsh: () => Promise<boolean>;
  versionTaskCancelRequested: boolean;
  setVersionTaskCancelRequested: (requested: boolean) => void;
  cancelVersionTask: () => Promise<boolean>;
  /** 普通浏览器标签 + 中心标签的最小真实语义（供 openDsh 断言） */
  browserTabs: {
    id: string;
    url: string;
    title: string;
    location?: 'panel' | 'center';
  }[];
  browserActiveTabId: string;
  centerTabs: { id: string; kind: string; refId: string | null }[];
  centerActiveTabId: string;
  browserOpenTab: (url?: string, title?: string) => void;
  browserUpdateTab: (tabId: string, patch: { url?: string }) => void;
  browserCloseTab: (tabId: string) => void;
  centerShowBrowserTab: (browserTabId: string) => void;
  centerSelectTab: (centerTabId: string) => void;
  centerUpdateTab: (centerTabId: string, patch: { kind?: string; refId?: string | null }) => void;
  browserSetLocation: (tabId: string, location: 'panel' | 'center') => void;
  clampPanelActiveTab: () => void;
  sourceStatus: { config: { version_source: string }; running?: unknown } | null;
  setDshSourceStatus: (status: unknown) => void;
  dshLastUrl: string | null;
  setDshLastUrl: (url: string | null) => void;
  dshRestarting: boolean;
  setDshRestarting: (restarting: boolean) => void;
  dshVersionSourcePending: string | null;
  setDshVersionSourcePending: (mode: string | null) => void;
  setDshVersionSourceDeferred: (deferred: boolean) => void;
  saveSourceConfig: (config: unknown, silent?: boolean) => Promise<boolean>;
  fetchSourceStatus: (silent?: boolean, force?: boolean) => Promise<boolean>;
  applyPendingVersionSource: () => Promise<boolean>;
  showToast: (message: string, type?: string) => string;
  showLoadingToast: (message: string, type?: string) => string;
  removeToast: (id: string) => void;
}

const shownToasts: string[] = [];

function makeStore() {
  const store = createStore<DshTestStore>((set, get) => {
    const dshActions = createDshActions(set as never, () => get() as never) as unknown as Pick<
      DshTestStore,
      | 'openDsh'
      | 'ensureDshUrl'
      | 'resolveDshPortConflict'
      | 'dismissDshRecoveryToast'
      | 'restartDsh'
      | 'fetchDshVersionStatus'
      | 'updateDsh'
      | 'cancelVersionTask'
      | 'applyPendingVersionSource'
    >;
    return {
      versionStatus: null,
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
      setDshVersionStatus: (status) => set({ versionStatus: status }),
      isTauri: false,
      siblingWebviewNonce: 0,
      bumpSiblingWebviewNonce: () =>
        set((s) => ({ siblingWebviewNonce: s.siblingWebviewNonce + 1 })),
      browserTabs: [],
      browserActiveTabId: '',
      centerTabs: [],
      centerActiveTabId: '',
      browserOpenTab: (url, title) =>
        set((s) => {
          const id = `bt${s.browserTabs.length + 1}`;
          return {
            browserTabs: [...s.browserTabs, { id, url: url ?? '', title: title ?? '' }],
            browserActiveTabId: id,
          };
        }),
      browserCloseTab: (tabId) =>
        set((s) => ({
          browserTabs: s.browserTabs.filter((t) => t.id !== tabId),
          centerTabs: s.centerTabs.filter((c) => c.refId !== tabId),
        })),
      browserUpdateTab: (tabId, patch) =>
        set((s) => ({
          browserTabs: s.browserTabs.map((t) => (t.id === tabId ? { ...t, ...patch } : t)),
        })),
      centerShowBrowserTab: (browserTabId) =>
        set((s) => {
          const centerId = `c${s.centerTabs.length + 1}`;
          return {
            browserTabs: s.browserTabs.map((t) =>
              t.id === browserTabId ? { ...t, location: 'center' as const } : t,
            ),
            centerTabs: [...s.centerTabs, { id: centerId, kind: 'browser', refId: browserTabId }],
            centerActiveTabId: centerId,
          };
        }),
      centerSelectTab: (centerTabId) => set({ centerActiveTabId: centerTabId }),
      centerUpdateTab: (tabId: string, patch: { kind?: string; refId?: string | null }) =>
        set((s) => ({
          centerTabs: s.centerTabs.map((c) => (c.id === tabId ? { ...c, ...patch } : c)),
        })),
      browserSetLocation: (tabId: string, location: 'panel' | 'center') =>
        set((s) => ({
          browserTabs: s.browserTabs.map((t) => (t.id === tabId ? { ...t, location } : t)),
        })),
      clampPanelActiveTab: () => {},
      versionTaskCancelRequested: false,
      setVersionTaskCancelRequested: (requested) => set({ versionTaskCancelRequested: requested }),
      sourceStatus: null,
      setDshSourceStatus: (status) => set({ sourceStatus: status as never }),
      dshPortConflict: null,
      setDshPortConflict: (info) => set({ dshPortConflict: info }),
      dshRecoveryToastId: null,
      setDshRecoveryToastId: (id) => set({ dshRecoveryToastId: id }),
      dshLastUrl: null,
      setDshLastUrl: (url) => set({ dshLastUrl: url }),
      dshRestarting: false,
      setDshRestarting: (restarting) => set({ dshRestarting: restarting }),
      dshVersionSourcePending: null,
      setDshVersionSourcePending: (mode) => set({ dshVersionSourcePending: mode }),
      setDshVersionSourceDeferred: () => {},
      saveSourceConfig: async () => true,
      fetchSourceStatus: async () => true,
      showToast: (message) => {
        shownToasts.push(message);
        return 'toast';
      },
      showLoadingToast: (message) => {
        shownToasts.push(message);
        return 'toast';
      },
      removeToast: () => {},
      ...dshActions,
    } as DshTestStore;
  });
  return store;
}

describe('dshActions.ensureDshUrl recovery toast', () => {
  let openMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    shownToasts.length = 0;
    openMock = vi.fn();
    vi.stubGlobal('digitalLife', { dsh: { open: openMock } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('首次启动超过 1.2s 时显示「正在启动」加载 toast', async () => {
    vi.useFakeTimers();
    let resolveOpen: (value: unknown) => void = () => {};
    openMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveOpen = resolve;
        }),
    );
    const store = makeStore();
    const promise = store.getState().ensureDshUrl({
      dshStarting: 'STARTING',
      dshRecovering: 'RECOVERING',
    });
    await vi.advanceTimersByTimeAsync(1400);
    expect(shownToasts).toEqual(['STARTING']);
    resolveOpen({ ok: true, data: { url: 'http://127.0.0.1:3080' } });
    await promise;
  });

  it('已有运行实例时显示「正在自动恢复」加载 toast', async () => {
    vi.useFakeTimers();
    let resolveOpen: (value: unknown) => void = () => {};
    openMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveOpen = resolve;
        }),
    );
    const store = makeStore();
    store.setState({
      sourceStatus: {
        config: { version_source: 'auto' },
        running: { url: 'http://127.0.0.1:3080/' },
      },
    });
    const promise = store.getState().ensureDshUrl({
      dshStarting: 'STARTING',
      dshRecovering: 'RECOVERING',
    });
    await vi.advanceTimersByTimeAsync(1400);
    expect(shownToasts).toEqual(['RECOVERING']);
    resolveOpen({ ok: true, data: { url: 'http://127.0.0.1:3080' } });
    await promise;
  });
});

describe('dshActions.openDsh', () => {
  beforeEach(() => {
    vi.stubGlobal('digitalLife', { dsh: { open: vi.fn() } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('成功时映射 {url, freedPort} 并创建普通中心浏览器标签', async () => {
    (window as any).digitalLife.dsh.open.mockResolvedValue({
      ok: true,
      data: { url: 'http://127.0.0.1:3080', freedPort: true },
    });
    const store = makeStore();
    const result = await store.getState().openDsh();
    expect(result).toEqual({ url: 'http://127.0.0.1:3080', freedPort: true });
    expect(store.getState().errorToasts).toEqual([]);

    // 成功即创建一个**普通**浏览器标签（无任何 dsh 专属标记）并移到中心。
    const tab = store.getState().browserTabs[0];
    expect(tab).toBeTruthy();
    expect(tab.location).toBe('center');
    expect(tab.url).toBe('http://127.0.0.1:3080');
    expect('isDsh' in tab).toBe(false);
    expect(
      store.getState().centerTabs.some((c) => c.kind === 'browser' && c.refId === tab.id),
    ).toBe(true);
  });

  it('入口页标签存在时新 dsh 标签就地绑定到该 launcher（不新增中心标签）', async () => {
    vi.stubGlobal('digitalLife', {
      dsh: {
        open: vi.fn(async () => ({
          ok: true,
          data: { url: 'http://127.0.0.1:3080/?token=abc', freedPort: false },
        })),
      },
    });
    const store = makeStore();
    store.setState({
      centerTabs: [{ id: 'c1', kind: 'launcher', refId: null } as never],
      centerActiveTabId: 'c1',
    });

    await store.getState().openDsh({ centerTabId: 'c1' });

    const s = store.getState();
    const browserTab = s.browserTabs[0];
    expect(browserTab?.location).toBe('center');
    expect(s.centerTabs).toHaveLength(1);
    expect(s.centerTabs[0]).toMatchObject({ id: 'c1', kind: 'browser', refId: browserTab?.id });
    expect(s.centerActiveTabId).toBe('c1');
  });

  it('成功但 data 为空时回落 url:null,freedPort:false（仍创建中心标签）', async () => {
    (window as any).digitalLife.dsh.open.mockResolvedValue({ ok: true, data: null });
    const store = makeStore();
    const result = await store.getState().openDsh();
    expect(result).toEqual({ url: null, freedPort: false });
    const tab = store.getState().browserTabs[0];
    expect(tab?.location).toBe('center');
  });

  it('失败返回 null、记录 scope=dsh 的错误卡片且不创建标签', async () => {
    (window as any).digitalLife.dsh.open.mockResolvedValue({
      ok: false,
      error: { code: 'TIMEOUT', message: 'npx not ready' },
    });
    const store = makeStore();
    const result = await store.getState().openDsh();
    expect(result).toBeNull();
    expect(store.getState().browserTabs).toEqual([]);
    expect(store.getState().centerTabs).toEqual([]);
    expect(store.getState().errorToasts).toEqual([
      { code: 'TIMEOUT', detail: 'npx not ready', scope: 'dsh' },
    ]);
  });

  it('成功后不递增 siblingWebviewNonce（不再创建 dsh 专属视图）', async () => {
    (window as any).digitalLife.dsh.open.mockResolvedValue({
      ok: true,
      data: { url: 'http://127.0.0.1:3080', freedPort: true },
    });
    const store = makeStore();
    store.setState({ isTauri: true });
    await store.getState().openDsh();
    expect(store.getState().siblingWebviewNonce).toBe(0);
  });

  it('已有同 URL 的普通标签时聚焦它，不新建标签', async () => {
    (window as any).digitalLife.dsh.open.mockResolvedValue({
      ok: true,
      data: { url: 'http://127.0.0.1:3080', freedPort: false },
    });
    const store = makeStore();
    store.getState().browserOpenTab('http://127.0.0.1:3080', 'dsh');
    const id = store.getState().browserActiveTabId;
    store.getState().centerShowBrowserTab(id);
    const centerCountBefore = store.getState().centerTabs.length;

    const result = await store.getState().openDsh();

    expect(result).toEqual({ url: 'http://127.0.0.1:3080', freedPort: false });
    expect(store.getState().browserTabs).toHaveLength(1);
    // 不新增中心标签；已有中心标签被重新选中。
    expect(store.getState().centerTabs).toHaveLength(centerCountBefore);
    expect(store.getState().centerActiveTabId).toBe(store.getState().centerTabs[0].id);
  });

  it('已有标签的入口 URL 变化时更新并导航（token 刷新）', async () => {
    const navigateTab = vi.fn(async () => {});
    vi.stubGlobal('digitalLife', {
      dsh: {
        open: vi.fn(async () => ({
          ok: true,
          data: {
            url: 'http://127.0.0.1:3080/?token=new',
            freedPort: false,
            authenticated: true,
          },
        })),
      },
      browser: { navigateTab },
    });
    const store = makeStore();
    store.getState().browserOpenTab('http://127.0.0.1:3080/', 'dsh');
    const id = store.getState().browserActiveTabId;

    await store.getState().openDsh();

    expect(store.getState().browserTabs).toHaveLength(1);
    expect(store.getState().browserTabs[0].url).toBe('http://127.0.0.1:3080/?token=new');
    expect(navigateTab).toHaveBeenCalledWith(id, 'http://127.0.0.1:3080/?token=new');
  });

  it('端口不同（同 host）的本地标签不被误复用，而是新建 dsh 标签', async () => {
    (window as any).digitalLife.dsh.open.mockResolvedValue({
      ok: true,
      data: { url: 'http://127.0.0.1:3080', freedPort: false },
    });
    const store = makeStore();
    // 已打开同 host、不同端口的本地标签（如开发服务器 5173）。
    store.getState().browserOpenTab('http://127.0.0.1:5173/', 'dev');

    const result = await store.getState().openDsh();

    expect(result).toEqual({ url: 'http://127.0.0.1:3080', freedPort: false });
    // 原 5173 标签不被改动；新建了 dsh 标签。
    expect(store.getState().browserTabs).toHaveLength(2);
    expect(store.getState().browserTabs.some((t) => t.url === 'http://127.0.0.1:5173/')).toBe(true);
    expect(store.getState().browserTabs.some((t) => t.url === 'http://127.0.0.1:3080')).toBe(true);
  });

  it('面板内的同服务标签被复用并移入中心（不新建）', async () => {
    (window as any).digitalLife.dsh.open.mockResolvedValue({
      ok: true,
      data: { url: 'http://127.0.0.1:3080', freedPort: false },
    });
    const store = makeStore();
    store.getState().browserOpenTab('http://127.0.0.1:3080', 'dsh');
    const id = store.getState().browserActiveTabId; // 仍在面板（location 未设）
    const centerCountBefore = store.getState().centerTabs.length;

    const result = await store.getState().openDsh();

    expect(result).toEqual({ url: 'http://127.0.0.1:3080', freedPort: false });
    expect(store.getState().browserTabs).toHaveLength(1);
    expect(store.getState().centerTabs).toHaveLength(centerCountBefore + 1);
    expect(store.getState().browserTabs.find((t) => t.id === id)?.location).toBe('center');
  });

  it('复用面板标签时把入口页就地绑定为 browser（不新增中心标签）', async () => {
    (window as any).digitalLife.dsh.open.mockResolvedValue({
      ok: true,
      data: { url: 'http://127.0.0.1:3080', freedPort: false },
    });
    const store = makeStore();
    store.getState().browserOpenTab('http://127.0.0.1:3080', 'dsh');
    const existingId = store.getState().browserActiveTabId;
    store.setState({
      centerTabs: [{ id: 'entry1', kind: 'launcher', refId: null }],
      centerActiveTabId: 'entry1',
    });
    const centerCountBefore = store.getState().centerTabs.length;

    const result = await store.getState().openDsh({ centerTabId: 'entry1' });

    expect(result).toEqual({ url: 'http://127.0.0.1:3080', freedPort: false });
    expect(store.getState().browserTabs).toHaveLength(1);
    expect(store.getState().centerTabs).toHaveLength(centerCountBefore);
    expect(store.getState().centerTabs.find((t) => t.id === 'entry1')).toMatchObject({
      kind: 'browser',
      refId: existingId,
    });
  });

  it('同 origin 的子路径标签也被复用且不被拽回入口 URL（SPA 路由保留）', async () => {
    const navigateTab = vi.fn();
    vi.stubGlobal('digitalLife', {
      dsh: {
        open: vi.fn(async () => ({
          ok: true,
          data: { url: 'http://127.0.0.1:3080/?token=new', freedPort: false },
        })),
      },
      browser: { navigateTab },
    });
    const store = makeStore();
    store.getState().browserOpenTab('http://127.0.0.1:3080/chat/123', 'dsh');
    const id = store.getState().browserActiveTabId;

    await store.getState().openDsh();

    // 复用同 origin 的子路径标签，不新建，也不重置用户当前 SPA 路由。
    expect(store.getState().browserTabs).toHaveLength(1);
    expect(store.getState().browserTabs.find((t) => t.id === id)?.url).toBe(
      'http://127.0.0.1:3080/chat/123',
    );
    expect(navigateTab).not.toHaveBeenCalled();
  });

  it('裸根路径在拿到 token 后会被刷新（认证入口修复）', async () => {
    const navigateTab = vi.fn(async () => {});
    vi.stubGlobal('digitalLife', {
      dsh: {
        open: vi.fn(async () => ({
          ok: true,
          data: { url: 'http://127.0.0.1:3080/?token=new', freedPort: false },
        })),
      },
      browser: { navigateTab },
    });
    const store = makeStore();
    store.getState().browserOpenTab('http://127.0.0.1:3080/', 'dsh');
    const id = store.getState().browserActiveTabId;

    await store.getState().openDsh();

    expect(store.getState().browserTabs.find((t) => t.id === id)?.url).toBe(
      'http://127.0.0.1:3080/?token=new',
    );
    expect(navigateTab).toHaveBeenCalledWith(id, 'http://127.0.0.1:3080/?token=new');
  });
  it('并发调用（快速双击）只拉起一次且只创建一个标签', async () => {
    let resolveOpen!: (value: unknown) => void;
    const open = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveOpen = resolve;
        }),
    );
    (window as any).digitalLife.dsh.open = open;
    const store = makeStore();

    const first = store.getState().openDsh();
    const second = store.getState().openDsh();
    // 第二次调用复用进行中的 promise：尚未 resolve 时不产生标签。
    expect(open).toHaveBeenCalledTimes(1);
    expect(store.getState().browserTabs).toEqual([]);

    resolveOpen({ ok: true, data: { url: 'http://127.0.0.1:3080', freedPort: false } });
    const [r1, r2] = await Promise.all([first, second]);

    expect(r1).toEqual({ url: 'http://127.0.0.1:3080', freedPort: false });
    expect(r2).toEqual({ url: 'http://127.0.0.1:3080', freedPort: false });
    expect(store.getState().browserTabs).toHaveLength(1);
    expect(open).toHaveBeenCalledTimes(1);
  });
});

describe('dshActions mutators (updateDsh 示例：boolean + 静默刷新语义)', () => {
  beforeEach(() => {
    vi.stubGlobal('digitalLife', {
      dsh: { update: vi.fn(), getVersionStatus: vi.fn() },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('成功：返回 true、刷新版本状态、不产生错误卡片', async () => {
    (window as any).digitalLife.dsh.update.mockResolvedValue({
      ok: true,
      data: '0.1.2-rc.1',
    });
    (window as any).digitalLife.dsh.getVersionStatus.mockResolvedValue({
      ok: true,
      data: {
        currentSelected: '0.1.2-rc.1',
        installed: [],
        latestAvailable: null,
        hasUpdate: false,
      },
    });
    const store = makeStore();
    const result = await store.getState().updateDsh();
    expect(result).toBe(true);
    expect(store.getState().versionStatus).toEqual({
      currentSelected: '0.1.2-rc.1',
      installed: [],
      latestAvailable: null,
      hasUpdate: false,
    });
    expect(store.getState().errorToasts).toEqual([]);
  });

  it('变异失败：返回 false、记录错误卡片、不执行刷新', async () => {
    (window as any).digitalLife.dsh.update.mockResolvedValue({
      ok: false,
      error: { code: 'NETWORK_ERROR', message: 'boom' },
    });
    const store = makeStore();
    const result = await store.getState().updateDsh();
    expect(result).toBe(false);
    const toasts = store.getState().errorToasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].code).toBe('NETWORK_ERROR');
    expect(toasts[0].scope).toBe('dsh');
    expect(toasts[0].detail).toContain('boom');
    // 变异失败不触发后续刷新，不会因刷新失败再叠加卡片。
    expect((window as any).digitalLife.dsh.getVersionStatus).not.toHaveBeenCalled();
  });

  it('变异成功但静默刷新失败：仍返回 true、且不新增错误卡片（best-effort）', async () => {
    (window as any).digitalLife.dsh.update.mockResolvedValue({ ok: true, data: '0.1.2-rc.1' });
    (window as any).digitalLife.dsh.getVersionStatus.mockResolvedValue({
      ok: false,
      error: { code: 'NETWORK_ERROR', message: 'refresh boom' },
    });
    const store = makeStore();
    const result = await store.getState().updateDsh();
    expect(result).toBe(true);
    // 静默刷新失败不记录卡片（不覆盖成功语义）。
    expect(store.getState().errorToasts).toEqual([]);
    expect(store.getState().versionStatus).toBeNull();
  });
});
describe('dshActions.restartDsh', () => {
  beforeEach(() => {
    vi.stubGlobal('digitalLife', { dsh: { restart: vi.fn() } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('重启成功后同源旧标签按原位置重建（先开后关，不多入口页）', async () => {
    const store = makeStore();
    store.getState().browserOpenTab('http://127.0.0.1:3080/?token=old', 'dsh');
    (window as any).digitalLife.dsh.restart.mockResolvedValue({
      ok: true,
      data: { restarted: true, url: 'http://127.0.0.1:3080/?token=new' },
    });
    const result = await store.getState().restartDsh();
    expect(result).toEqual({
      restarted: true,
      url: 'http://127.0.0.1:3080/?token=new',
      failed: false,
    });
    // 旧标签被关闭且仅剩一个新标签（先开后关，中心永不为空）。
    expect(store.getState().browserTabs).toHaveLength(1);
    expect(store.getState().browserTabs[0].url).toBe('http://127.0.0.1:3080/?token=new');
  });

  it('面板 dsh 标签重建后仍留在面板（不被劫持到中心）', async () => {
    const store = makeStore();
    store.getState().browserOpenTab('http://127.0.0.1:3080/?token=old', 'dsh');
    (window as any).digitalLife.dsh.restart.mockResolvedValue({
      ok: true,
      data: { restarted: true, url: 'http://127.0.0.1:3080/?token=new' },
    });
    await store.getState().restartDsh();
    const tabs = store.getState().browserTabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0].location).not.toBe('center');
    expect(store.getState().centerTabs).toHaveLength(0);
  });

  it('中心 dsh 标签重建后仍在中心且不产生入口页', async () => {
    const store = makeStore();
    store.getState().browserOpenTab('http://127.0.0.1:3080/?token=old', 'dsh');
    const oldId = store.getState().browserActiveTabId;
    store.getState().centerShowBrowserTab(oldId);
    (window as any).digitalLife.dsh.restart.mockResolvedValue({
      ok: true,
      data: { restarted: true, url: 'http://127.0.0.1:3080/?token=new' },
    });
    await store.getState().restartDsh();
    const tabs = store.getState().browserTabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0].url).toBe('http://127.0.0.1:3080/?token=new');
    expect(tabs[0].location).toBe('center');
    // 中心仅剩重建后的 dsh 标签，无多余入口页。
    expect(store.getState().centerTabs).toHaveLength(1);
    expect(store.getState().centerTabs[0].kind).toBe('browser');
    expect(store.getState().centerTabs[0].refId).toBe(tabs[0].id);
  });

  it('重启失败标记 failed 且不动标签', async () => {
    const store = makeStore();
    store.getState().browserOpenTab('http://127.0.0.1:3080/?token=old', 'dsh');
    (window as any).digitalLife.dsh.restart.mockResolvedValue({
      ok: false,
      error: { code: 'IO', message: 'boom' },
    });
    const result = await store.getState().restartDsh();
    expect(result).toEqual({ restarted: false, url: null, failed: true });
    expect(store.getState().browserTabs[0].url).toBe('http://127.0.0.1:3080/?token=old');
  });

  it('无 dsh 标签时重启不自动新建标签（事项 2026-10-20/5）', async () => {
    const store = makeStore();
    store.getState().browserOpenTab('https://example.com', 'other');
    (window as any).digitalLife.dsh.restart.mockResolvedValue({
      ok: true,
      data: { restarted: true, url: 'http://127.0.0.1:3080/?token=new' },
    });
    const result = await store.getState().restartDsh();
    expect(result.failed).toBe(false);
    expect(store.getState().browserTabs).toHaveLength(1);
    expect(store.getState().browserTabs[0].url).toBe('https://example.com');
  });
});

describe('dshActions.applyPendingVersionSource', () => {
  beforeEach(() => {
    vi.stubGlobal('digitalLife', {
      dsh: { saveSourceConfig: vi.fn(), restart: vi.fn(), getSourceStatus: vi.fn() },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('无 pending 返回 false 且不碰后端', async () => {
    const store = makeStore();
    await expect(store.getState().applyPendingVersionSource()).resolves.toBe(false);
    expect((window as any).digitalLife.dsh.saveSourceConfig).not.toHaveBeenCalled();
  });

  it('pending 与已持久化一致时直接消费，不重启', async () => {
    const store = makeStore();
    store.setState({
      dshVersionSourcePending: 'system',
      sourceStatus: { config: { version_source: 'system' } },
    });
    await expect(store.getState().applyPendingVersionSource()).resolves.toBe(true);
    expect((window as any).digitalLife.dsh.saveSourceConfig).not.toHaveBeenCalled();
    expect((window as any).digitalLife.dsh.restart).not.toHaveBeenCalled();
    expect(store.getState().dshVersionSourcePending).toBeNull();
  });

  it('pending 落盘 + 静默重启 + 消费（事项 2026-10-20/5）', async () => {
    const store = makeStore();
    store.setState({
      dshVersionSourcePending: 'system',
      sourceStatus: { config: { version_source: 'host' } },
    });
    (window as any).digitalLife.dsh.saveSourceConfig.mockResolvedValue({ ok: true, data: true });
    (window as any).digitalLife.dsh.restart.mockResolvedValue({
      ok: true,
      data: { restarted: true, url: 'http://127.0.0.1:3080/?token=t' },
    });
    (window as any).digitalLife.dsh.getSourceStatus.mockResolvedValue({
      ok: true,
      data: { config: { version_source: 'system' } },
    });
    await expect(store.getState().applyPendingVersionSource()).resolves.toBe(true);
    expect((window as any).digitalLife.dsh.saveSourceConfig).toHaveBeenCalledWith({
      version_source: 'system',
    });
    expect((window as any).digitalLife.dsh.restart).toHaveBeenCalled();
    expect(store.getState().dshVersionSourcePending).toBeNull();
  });

  it('落盘失败保留 pending，下次启动重试', async () => {
    const store = makeStore();
    store.setState({
      dshVersionSourcePending: 'system',
      sourceStatus: { config: { version_source: 'host' } },
    });
    (window as any).digitalLife.dsh.saveSourceConfig.mockResolvedValue({
      ok: false,
      error: { message: 'down' },
    });
    await expect(store.getState().applyPendingVersionSource()).resolves.toBe(true);
    expect((window as any).digitalLife.dsh.restart).not.toHaveBeenCalled();
    expect(store.getState().dshVersionSourcePending).toBe('system');
  });
});

describe('dshActions.cancelVersionTask', () => {
  beforeEach(() => {
    vi.stubGlobal('digitalLife', { dsh: { cancelVersionTask: vi.fn() } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('取消送达返回 true 且保持取消标记', async () => {
    const store = makeStore();
    (window as any).digitalLife.dsh.cancelVersionTask.mockResolvedValue({ ok: true, data: true });
    const result = await store.getState().cancelVersionTask();
    expect(result).toBe(true);
    expect(store.getState().versionTaskCancelRequested).toBe(true);
  });

  it('取消未送达（!ok）返回 false 且复位标记，避免后续真错误被吞', async () => {
    const store = makeStore();
    (window as any).digitalLife.dsh.cancelVersionTask.mockResolvedValue({
      ok: false,
      error: { code: 'IO_ERROR', message: 'boom' },
    });
    const result = await store.getState().cancelVersionTask();
    expect(result).toBe(false);
    expect(store.getState().versionTaskCancelRequested).toBe(false);
  });

  it('桥抛异常返回 false 且复位标记', async () => {
    const store = makeStore();
    (window as any).digitalLife.dsh.cancelVersionTask.mockRejectedValue(new Error('down'));
    const result = await store.getState().cancelVersionTask();
    expect(result).toBe(false);
    expect(store.getState().versionTaskCancelRequested).toBe(false);
  });
});

describe('shouldRefreshDshTab', () => {
  it('refreshes a bare entry root when a token becomes available', () => {
    expect(shouldRefreshDshTab('http://127.0.0.1:3080/', 'http://127.0.0.1:3080/?token=new')).toBe(
      true,
    );
  });

  it('refreshes an entry root with a stale token', () => {
    expect(
      shouldRefreshDshTab('http://127.0.0.1:3080/?token=old', 'http://127.0.0.1:3080/?token=new'),
    ).toBe(true);
  });

  it('preserves SPA subpaths and same/absent tokens', () => {
    expect(
      shouldRefreshDshTab('http://127.0.0.1:3080/chat/123', 'http://127.0.0.1:3080/?token=new'),
    ).toBe(false);
    expect(
      shouldRefreshDshTab('http://127.0.0.1:3080/?token=new', 'http://127.0.0.1:3080/?token=new'),
    ).toBe(false);
    expect(shouldRefreshDshTab('http://127.0.0.1:3080/', 'http://127.0.0.1:3080/')).toBe(false);
  });

  it('ignores other origins', () => {
    expect(shouldRefreshDshTab('http://127.0.0.1:3081/', 'http://127.0.0.1:3080/?token=x')).toBe(
      false,
    );
  });
});
