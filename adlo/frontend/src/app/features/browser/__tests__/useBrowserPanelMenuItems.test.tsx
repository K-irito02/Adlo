import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppStore } from '@stores/slicedStore';
import { IpcErrorCode } from '@shared/ipc/shared';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import { useBrowserPanelMenuItems } from '../useBrowserPanelMenuItems';
import type { BrowserMenuItem } from '../useBrowserMenus';

const mockT = {
  browserHardReload: '强制刷新',
  browserHardReloadHint: 'hint',
  browserClearSiteCookies: '清除本站 Cookie',
  browserClearSiteCookiesHint: 'hint',
  browserClearCookies: '清除全部 Cookie',
  browserClearCookiesHint: 'hint',
  browserClearSiteCache: '清除本站缓存',
  browserClearSiteCacheHint: 'hint',
  browserClearCache: '清除全部缓存',
  browserClearCacheHint: 'hint',
  browserDeveloperTools: '打开开发者工具',
  browserDeveloperToolsHint: 'hint',
  browserToastSiteCookiesCleared: '已清除本站 Cookie，正在重新加载页面',
  browserToastCookiesCleared: '已清除全部 Cookie，正在重新加载页面',
  browserToastSiteCacheCleared: '已清除本站缓存，正在重新加载页面',
  browserToastCacheCleared: '已清除全部缓存，正在重新加载页面',
  browserToastTabNotReady: '该标签尚未以原生窗口加载',
  browserToastActionFailed: '操作失败',
  browserImportBookmarks: '导入书签',
  browserImportBookmarksHint: 'hint',
  browserExportBookmarks: '导出书签',
  browserExportBookmarksHint: 'hint',
  menuZoomIn: '放大',
  menuZoomInHint: 'hint',
  menuZoomOut: '缩小',
  menuZoomOutHint: 'hint',
  menuResetZoom: '重置',
  menuResetZoomHint: 'hint',
};

function makeTab(id: string): BrowserTabState {
  return {
    id,
    workspaceId: 'ws1',
    title: 'Tab',
    url: 'https://example.com/',
    titleResolved: true,
    isPinned: false,
    sortOrder: 0,
    isPlayingAudio: false,
    isAudioMuted: false,
    isDownloading: false,
  };
}

function findItem(items: BrowserMenuItem[], id: string) {
  const item = items.find((entry) => entry.id === id);
  if (!item || 'separator' in item) {
    throw new Error(`menu item ${id} not found`);
  }
  return item;
}

const bridge = {
  hardReloadTab: vi.fn<(id: string) => Promise<void>>(() => Promise.resolve()),
  openDevtools: vi.fn<(id: string) => Promise<void>>(() => Promise.resolve()),
  clearSiteCookies: vi.fn<(id: string) => Promise<void>>(() => Promise.resolve()),
  clearCookies: vi.fn<(id: string) => Promise<void>>(() => Promise.resolve()),
  clearSiteCache: vi.fn<(id: string) => Promise<void>>(() => Promise.resolve()),
  clearCache: vi.fn<(id: string) => Promise<void>>(() => Promise.resolve()),
  setZoom: vi.fn<(id: string, zoom: number) => Promise<void>>(() => Promise.resolve()),
};

const showToast = vi.fn();

function renderMenu(isTauri = true) {
  useAppStore.setState({ isTauri, showToast });
  return renderHook(() =>
    useBrowserPanelMenuItems({
      activeTab: makeTab('tab-1'),
      zoomLevel: 1,
      setZoomLevel: vi.fn(),
      t: mockT as never,
    }),
  );
}

describe('useBrowserPanelMenuItems', () => {
  beforeEach(() => {
    Object.assign(window, { digitalLife: { browser: bridge } });
    Object.values(bridge).forEach((fn) => fn.mockClear());
    showToast.mockClear();
  });

  afterEach(() => {
    useAppStore.setState({ isTauri: false });
  });

  it('开发者工具按当前标签打开，而不是交给应用壳', async () => {
    const { result } = renderMenu();
    await act(async () => {
      findItem(result.current.browserMenuItems, 'devtools').action?.();
      await Promise.resolve();
    });

    expect(bridge.openDevtools).toHaveBeenCalledWith('tab-1');
  });

  it('标签页 WebView 尚未创建时给出“未就绪”提示而不是静默失败', async () => {
    bridge.openDevtools.mockRejectedValueOnce(
      Object.assign(new Error('not found'), { code: IpcErrorCode.NOT_FOUND }),
    );
    const { result } = renderMenu();
    await act(async () => {
      findItem(result.current.browserMenuItems, 'devtools').action?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(showToast).toHaveBeenCalledWith(mockT.browserToastTabNotReady, 'error', 'browser-menu');
  });

  it('清除本站 Cookie 与清除全部 Cookie 是两个不同入口，成功后有反馈', async () => {
    const { result } = renderMenu();

    await act(async () => {
      findItem(result.current.browserMenuItems, 'clear-site-cookies').action?.();
      await Promise.resolve();
    });
    expect(bridge.clearSiteCookies).toHaveBeenCalledWith('tab-1');
    expect(showToast).toHaveBeenCalledWith(
      mockT.browserToastSiteCookiesCleared,
      'success',
      'browser-menu',
    );

    showToast.mockClear();
    await act(async () => {
      findItem(result.current.browserMenuItems, 'clear-cookies').action?.();
      await Promise.resolve();
    });
    expect(bridge.clearCookies).toHaveBeenCalledWith('tab-1');
    expect(showToast).toHaveBeenCalledWith(
      mockT.browserToastCookiesCleared,
      'success',
      'browser-menu',
    );
  });

  it('强制刷新走忽略缓存的命令，而不是 location.reload', async () => {
    const { result } = renderMenu();
    await act(async () => {
      findItem(result.current.browserMenuItems, 'hard-reload').action?.();
      await Promise.resolve();
    });

    expect(bridge.hardReloadTab).toHaveBeenCalledWith('tab-1');
  });

  it('两个缓存入口分别清站点数据与全局缓存，成功提示写明会重新加载', async () => {
    const { result } = renderMenu();

    await act(async () => {
      findItem(result.current.browserMenuItems, 'clear-site-cache').action?.();
      await Promise.resolve();
    });
    expect(bridge.clearSiteCache).toHaveBeenCalledWith('tab-1');
    expect(showToast).toHaveBeenCalledWith(
      mockT.browserToastSiteCacheCleared,
      'success',
      'browser-menu',
    );

    showToast.mockClear();
    await act(async () => {
      findItem(result.current.browserMenuItems, 'clear-cache').action?.();
      await Promise.resolve();
    });
    expect(bridge.clearCache).toHaveBeenCalledWith('tab-1');
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(
      mockT.browserToastCacheCleared,
      'success',
      'browser-menu',
    );
  });

  it('连点两次放大按最新基座递进（1.0 → 1.1 → 1.2）', async () => {
    const setZoomLevel = vi.fn();
    const { result } = renderHook(() =>
      useBrowserPanelMenuItems({
        activeTab: makeTab('tab-1'),
        zoomLevel: 1,
        setZoomLevel,
        t: mockT as never,
      }),
    );

    await act(async () => {
      // 两次点击落在同一 IPC 往返窗口内：基座必须用 ref 递进，不能读渲染期 prop。
      findItem(result.current.browserMenuItems, 'zoom-in').action?.();
      findItem(result.current.browserMenuItems, 'zoom-in').action?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(bridge.setZoom).toHaveBeenCalledTimes(2);
    expect(bridge.setZoom).toHaveBeenNthCalledWith(1, 'tab-1', 1.1);
    expect(bridge.setZoom).toHaveBeenNthCalledWith(2, 'tab-1', 1.2);
    expect(setZoomLevel).toHaveBeenLastCalledWith(1.2);
  });

  it('「清除历史」已从菜单移除（历史面板自带删除入口）', () => {
    const { result } = renderMenu();
    expect(result.current.browserMenuItems.some((item) => item.id === 'clear-history')).toBe(false);
  });

  it('Cookie 两项与缓存两项各自成组，两组之间有分隔线且 id 不重复', () => {
    const { result } = renderMenu();
    const ids = result.current.browserMenuItems.map((item) => item.id);
    const at = (id: string) => ids.indexOf(id);

    expect(at('clear-site-cookies')).toBeLessThan(at('clear-cookies'));
    expect(at('clear-cookies')).toBeLessThan(at('clear-site-cache'));
    expect(at('clear-site-cache')).toBeLessThan(at('clear-cache'));

    const betweenGroups = ids.slice(at('clear-cookies') + 1, at('clear-site-cache'));
    expect(betweenGroups).toHaveLength(1);
    expect(betweenGroups[0]).toBe('sep-2');

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('不再提供「复制网址」菜单项（地址栏已有复制按钮）', () => {
    const { result } = renderMenu();
    expect(result.current.browserMenuItems.some((item) => item.id === 'copy-url')).toBe(false);
  });

  it('浏览器预览模式下桌面专属动作一律禁用', () => {
    const { result } = renderMenu(false);
    for (const id of [
      'hard-reload',
      'clear-site-cookies',
      'clear-cookies',
      'clear-site-cache',
      'clear-cache',
      'devtools',
      'zoom-in',
      'zoom-out',
      'zoom-reset',
    ]) {
      expect(findItem(result.current.browserMenuItems, id).disabled).toBe(true);
    }
  });
});
