import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createStore } from 'zustand';
import { createDshActions } from '../dshActions';
import type { DshOpenResult } from '../../../../shared/ipc/dsh';

/** dshActions 依赖的最小 store 表面（其余动作字段以 unknown 桩代） */
interface DshTestStore {
  isOpen: boolean;
  url: string | null;
  versionStatus: unknown;
  closeDialogVisible: boolean;
  errorToasts: { code: string; detail: string; scope?: string }[];
  reportError: (code: string, detail: string, scope?: string) => string;
  clearErrorToasts: (scope?: string) => void;
  setDshOpen: (open: boolean) => void;
  setDshUrl: (url: string | null) => void;
  setDshVersionStatus: (status: unknown) => void;
  setDshCloseDialogVisible: (visible: boolean) => void;
  isTauri: boolean;
  siblingWebviewNonce: number;
  bumpSiblingWebviewNonce: () => void;
  fetchDshVersionStatus: () => Promise<boolean>;
  openDsh: () => Promise<DshOpenResult | null>;
  updateDsh: () => Promise<boolean>;
  closeDsh: (keep: boolean) => Promise<boolean>;
  /** 浏览器标签 + 中心标签的最小真实语义（供 openDsh 创建 isDsh 中心标签断言） */
  browserTabs: {
    id: string;
    url: string;
    title: string;
    isDsh?: boolean;
    location?: 'panel' | 'center';
  }[];
  browserActiveTabId: string;
  centerTabs: { id: string; kind: string; refId: string | null }[];
  browserOpenTab: (url?: string, title?: string) => void;
  browserUpdateTab: (tabId: string, patch: { isDsh?: boolean }) => void;
  centerShowBrowserTab: (browserTabId: string) => void;
}

function makeStore() {
  const store = createStore<DshTestStore>((set, get) => {
    const dshActions = createDshActions(set as never, () => get() as never) as unknown as Pick<
      DshTestStore,
      'openDsh' | 'fetchDshVersionStatus' | 'updateDsh' | 'closeDsh'
    >;
    return {
      isOpen: false,
      url: null,
      versionStatus: null,
      closeDialogVisible: false,
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
      setDshOpen: (open) => set({ isOpen: open }),
      setDshUrl: (url) => set({ url }),
      setDshVersionStatus: (status) => set({ versionStatus: status }),
      setDshCloseDialogVisible: (visible) => set({ closeDialogVisible: visible }),
      isTauri: false,
      siblingWebviewNonce: 0,
      bumpSiblingWebviewNonce: () =>
        set((s) => ({ siblingWebviewNonce: s.siblingWebviewNonce + 1 })),
      browserTabs: [],
      browserActiveTabId: '',
      centerTabs: [],
      browserOpenTab: (url, title) =>
        set((s) => {
          const id = `bt${s.browserTabs.length + 1}`;
          return {
            browserTabs: [...s.browserTabs, { id, url: url ?? '', title: title ?? '' }],
            browserActiveTabId: id,
          };
        }),
      browserUpdateTab: (tabId, patch) =>
        set((s) => ({
          browserTabs: s.browserTabs.map((t) => (t.id === tabId ? { ...t, ...patch } : t)),
        })),
      centerShowBrowserTab: (browserTabId) =>
        set((s) => ({
          browserTabs: s.browserTabs.map((t) =>
            t.id === browserTabId ? { ...t, location: 'center' as const } : t,
          ),
          centerTabs: [
            ...s.centerTabs,
            { id: `c${s.centerTabs.length + 1}`, kind: 'browser', refId: browserTabId },
          ],
        })),
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

  it('成功时映射 {url, freedPort}、写入 dsh 状态并创建 isDsh 中心浏览器标签', async () => {
    (window as any).digitalLife.dsh.open.mockResolvedValue({
      ok: true,
      data: { url: 'http://127.0.0.1:3080', freedPort: true },
    });
    const store = makeStore();
    const result = await store.getState().openDsh();
    expect(result).toEqual({ url: 'http://127.0.0.1:3080', freedPort: true });
    expect(store.getState().isOpen).toBe(true);
    expect(store.getState().url).toBe('http://127.0.0.1:3080');
    expect(store.getState().errorToasts).toEqual([]);

    // 成功即创建承载 dsh 的普通浏览器标签，并移到中心（isDsh 标记随标签持久化）。
    const tab = store.getState().browserTabs[0];
    expect(tab).toBeTruthy();
    expect(tab.isDsh).toBe(true);
    expect(tab.location).toBe('center');
    expect(tab.url).toBe('http://127.0.0.1:3080');
    expect(
      store.getState().centerTabs.some((c) => c.kind === 'browser' && c.refId === tab.id),
    ).toBe(true);
  });

  it('成功但 data 为空时回落 url:null,freedPort:false（仍创建 isDsh 中心标签）', async () => {
    (window as any).digitalLife.dsh.open.mockResolvedValue({ ok: true, data: null });
    const store = makeStore();
    const result = await store.getState().openDsh();
    expect(result).toEqual({ url: null, freedPort: false });
    expect(store.getState().isOpen).toBe(true);
    expect(store.getState().url).toBeNull();
    const tab = store.getState().browserTabs[0];
    expect(tab?.isDsh).toBe(true);
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
    expect(store.getState().isOpen).toBe(false);
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
