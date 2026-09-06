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
  fetchDshVersionStatus: () => Promise<boolean>;
  openDsh: () => Promise<DshOpenResult | null>;
  updateDsh: () => Promise<boolean>;
  closeDsh: (keep: boolean) => Promise<boolean>;
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

  it('成功时映射 {url, freedPort} 并写入 dsh 状态', async () => {
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
  });

  it('成功但 data 为空时回落 url:null,freedPort:false', async () => {
    (window as any).digitalLife.dsh.open.mockResolvedValue({ ok: true, data: null });
    const store = makeStore();
    const result = await store.getState().openDsh();
    expect(result).toEqual({ url: null, freedPort: false });
    expect(store.getState().isOpen).toBe(true);
    expect(store.getState().url).toBeNull();
  });

  it('失败返回 null 并记录 scope=dsh 的错误卡片', async () => {
    (window as any).digitalLife.dsh.open.mockResolvedValue({
      ok: false,
      error: { code: 'TIMEOUT', message: 'npx not ready' },
    });
    const store = makeStore();
    const result = await store.getState().openDsh();
    expect(result).toBeNull();
    expect(store.getState().isOpen).toBe(false);
    expect(store.getState().errorToasts).toEqual([
      { code: 'TIMEOUT', detail: 'npx not ready', scope: 'dsh' },
    ]);
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
