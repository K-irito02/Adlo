import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAppStore } from '@stores/slicedStore';
import { shouldHostHideTab } from '../browserPoolSingleton';
import { HIDDEN_WEBVIEW_OFFSCREEN_COORD } from '../useWebViewVisibility';

describe('shouldHostHideTab（E1 双宿主竞态守卫）', () => {
  it('面板不隐藏已归属中心的标签，中心不隐藏已归属面板的标签', () => {
    expect(shouldHostHideTab('panel', { location: 'center' })).toBe(false);
    expect(shouldHostHideTab('center', { location: 'center' })).toBe(true);
    expect(shouldHostHideTab('center', { location: 'panel' })).toBe(false);
    expect(shouldHostHideTab('panel', { location: 'panel' })).toBe(true);
    // 缺省 location 等同面板。
    expect(shouldHostHideTab('panel', {})).toBe(true);
    expect(shouldHostHideTab('center', {})).toBe(false);
  });

  it('已删除的标签允许隐藏（不残留表面）', () => {
    expect(shouldHostHideTab('panel', undefined)).toBe(true);
    expect(shouldHostHideTab('center', undefined)).toBe(true);
  });
});

describe('面板→中心移动：最终 setTabBounds 为中心矩形（Tauri mock 集成）', () => {
  const setTabBounds = vi.fn(async (_tabId: string, _bounds: unknown) => undefined);

  beforeEach(() => {
    setTabBounds.mockClear();
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    (window as unknown as { digitalLife?: unknown }).digitalLife = {
      browser: { setTabBounds },
    };
    useAppStore.setState({
      browserTabs: [],
      browserTabsById: {},
      browserActiveTabId: '',
      centerTabs: [],
      centerActiveTabId: '',
    });
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    (window as unknown as { digitalLife?: unknown }).digitalLife = undefined;
  });

  /**
   * 复刻两宿主 effect 的隐藏/显示调用（与 `useWebViewLifecycle` /
   * `useWebViewVisibility` 内的守卫逻辑一致）：面板隐藏前查最新归属，
   * 中心显示走 bounds 同步。两种跑序下最终调用都必须是中心矩形。
   */
  function panelHideAttempt(tabId: string): void {
    const fresh = useAppStore.getState().browserTabsById[tabId];
    if (!shouldHostHideTab('panel', fresh)) {
      return;
    }
    void window.digitalLife?.browser?.setTabBounds(tabId, {
      x: HIDDEN_WEBVIEW_OFFSCREEN_COORD,
      y: HIDDEN_WEBVIEW_OFFSCREEN_COORD,
      width: 1,
      height: 1,
    });
  }

  function centerShow(
    tabId: string,
    rect: { x: number; y: number; width: number; height: number },
  ) {
    void window.digitalLife?.browser?.setTabBounds(tabId, rect);
  }

  it.each([['panel-first'], ['center-first']] as const)(
    '跑序 %s：面板隐藏被守卫跳过，中心显示胜出',
    (order) => {
      useAppStore.getState().browserOpenTab('https://move.test', 'Move');
      const tabId = useAppStore.getState().browserActiveTabId;
      // 面板→中心移动（store 先更新，effects 后跑 —— 与生产时序一致）。
      useAppStore.getState().centerShowBrowserTab(tabId);
      expect(useAppStore.getState().browserTabsById[tabId].location).toBe('center');

      const centerRect = { x: 300, y: 50, width: 700, height: 950 };
      if (order === 'panel-first') {
        panelHideAttempt(tabId);
        centerShow(tabId, centerRect);
      } else {
        centerShow(tabId, centerRect);
        panelHideAttempt(tabId);
      }

      expect(setTabBounds).toHaveBeenCalledTimes(1);
      expect(setTabBounds).toHaveBeenLastCalledWith(tabId, centerRect);
    },
  );

  it('中心→面板移动：中心隐藏被守卫跳过，面板显示胜出', () => {
    useAppStore.getState().browserOpenTab('https://back.test', 'Back');
    const tabId = useAppStore.getState().browserActiveTabId;
    useAppStore.getState().centerShowBrowserTab(tabId);
    const centerTab = useAppStore.getState().centerTabs.find((t) => t.refId === tabId)!;
    useAppStore.getState().centerReturnToPanel(centerTab.id);
    expect(useAppStore.getState().browserTabsById[tabId].location).toBe('panel');

    const panelRect = { x: 1200, y: 50, width: 700, height: 950 };
    // 中心隐藏尝试（守卫跳过）→ 面板显示。
    const fresh = useAppStore.getState().browserTabsById[tabId];
    if (shouldHostHideTab('center', fresh)) {
      void window.digitalLife?.browser?.setTabBounds(tabId, {
        x: HIDDEN_WEBVIEW_OFFSCREEN_COORD,
        y: HIDDEN_WEBVIEW_OFFSCREEN_COORD,
        width: 1,
        height: 1,
      });
    }
    void window.digitalLife?.browser?.setTabBounds(tabId, panelRect);

    expect(setTabBounds).toHaveBeenCalledTimes(1);
    expect(setTabBounds).toHaveBeenLastCalledWith(tabId, panelRect);
  });
});
