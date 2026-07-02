import { useEffect, useState } from 'react';

interface UseBrowserZoomStateOptions {
  activeTabId: string | undefined;
}

/**
 * BrowserPanel 缩放状态子 Hook：
 * - 持有 zoomLevel（0.5 ~ 2.0）
 * - 在 activeTab.id 变化时重置缩放为 1.0
 *
 * 实际应用缩放（Tauri setZoom / document.documentElement.style.zoom）仍由
 * browserMenuItems 中的 zoom-in / zoom-out / zoom-reset 回调执行。
 */
export function useBrowserZoomState({ activeTabId }: UseBrowserZoomStateOptions) {
  const [zoomLevel, setZoomLevel] = useState(1.0);

  useEffect(() => {
    setZoomLevel(1.0);
  }, [activeTabId]);

  return {
    zoomLevel,
    setZoomLevel,
  };
}
