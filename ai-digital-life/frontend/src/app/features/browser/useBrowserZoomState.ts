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
 * - 实际应用缩放（Tauri setZoom / document.documentElement.style.zoom）仍由
 *   browserMenuItems 中的 zoom-in / zoom-out / zoom-reset 回调执行 ——
 *   本 hook 只换步进基座（菜单回调 API 不变），切换标签时不自动改 document 缩放
 *   （与旧行为一致：旧重置同样只改基座、不触 document）。
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
