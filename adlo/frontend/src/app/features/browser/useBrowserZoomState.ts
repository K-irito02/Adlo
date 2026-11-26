import { useCallback } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { DEFAULT_BROWSER_ZOOM } from '@stores/slices/browserSliceShared';

interface UseBrowserZoomStateOptions {
  activeTabId: string | undefined;
}

/**
 * BrowserPanel 缩放状态子 Hook（Task 24：按标签持久化）：
 * - 各标签的缩放经 `adl:browser.zoomByTab` 按标签隔离（无记录取 1.0）；
 * - 标签切换不重置、不互影响（旧的"切换即重置 1.0" effect 已删除）；
 * - 实际应用缩放只在桌面端由「更多操作」菜单的 zoom-in / zoom-out / zoom-reset
 *   回调下发 `browser.setZoom`；浏览器预览模式这三项为禁用态，没有缩放应用路径。
 *   本 hook 只负责按标签保存步进基座，切换标签时不改实际 WebView 缩放。
 */
export function useBrowserZoomState({ activeTabId }: UseBrowserZoomStateOptions) {
  const zoomByTab = useAppStore((s) => s.browserZoomByTab);
  const setBrowserZoomByTab = useAppStore((s) => s.setBrowserZoomByTab);
  const zoomLevel =
    activeTabId !== undefined
      ? (zoomByTab[activeTabId] ?? DEFAULT_BROWSER_ZOOM)
      : DEFAULT_BROWSER_ZOOM;

  const setZoomLevel = useCallback(
    (zoom: number) => {
      if (activeTabId !== undefined) {
        setBrowserZoomByTab(activeTabId, zoom);
      }
    },
    [activeTabId, setBrowserZoomByTab],
  );

  return {
    zoomLevel,
    setZoomLevel,
  };
}
