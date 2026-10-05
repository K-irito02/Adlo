import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createStore } from 'zustand';
import { createDshActions } from '../dshActions';
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
  openDsh: () => Promise<DshOpenResult | null>;
  updateDsh: () => Promise<boolean>;
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
  centerShowBrowserTab: (browserTabId: string) => void;
  centerSelectTab: (centerTabId: string) => void;
}

function makeStore() {
  const store = createStore<DshTestStore>((set, get) => {
    const dshActions = createDshActions(set as never, () => get() as never) as unknown as Pick<
      DshTestStore,
      'openDsh' | 'fetchDshVersionStatus' | 'updateDsh'
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
      ...dshActions,
    } as DshTestStore;
  });
  return store;
}

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

  it('同 origin 的子路径标签也被复用（SPA 路由后不重复开标签）', async () => {
    (window as any).digitalLife.dsh.open.mockResolvedValue({
      ok: true,
      data: { url: 'http://127.0.0.1:3080', freedPort: false },
    });
    const store = makeStore();
    store.getState().browserOpenTab('http://127.0.0.1:3080/chat/123', 'dsh');
    const id = store.getState().browserActiveTabId;

    const result = await store.getState().openDsh();

    expect(result).toEqual({ url: 'http://127.0.0.1:3080', freedPort: false });
    // 复用同 origin 的子路径标签，不新建。
    expect(store.getState().browserTabs).toHaveLength(1);
    expect(store.getState().browserTabs.find((t) => t.id === id)?.location).toBe('center');
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
