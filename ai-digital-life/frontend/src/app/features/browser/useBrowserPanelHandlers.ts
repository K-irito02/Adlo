import { useCallback, useRef } from 'react';

export interface UseBrowserPanelHandlersParams {
  browserOpenTab: (url?: string, title?: string, workspaceId?: string, folderId?: string) => void;
  browserNavigateActiveTab: (url: string, title?: string) => void;
  browserSelectTab: (tabId: string) => void;
  browserNavigateInPlace: boolean;
  setBrowserNavigateInPlace: (value: boolean) => void;
  expectedNavigationUrlRef: React.MutableRefObject<{ url: string; at: number } | null>;
}

export interface UseBrowserPanelHandlersResult {
  pendingNavigationsRef: React.MutableRefObject<Set<string>>;
  handleNavigationStart: (url: string) => void;
  handleOpenTabFromTree: (url: string, tabId?: string) => void;
  handleToggleNavigateMode: (checked: boolean) => void;
  handleAlwaysNewTab: (title: string) => void;
  handlePointerDown: (e: React.PointerEvent) => void;
}

export function useBrowserPanelHandlers(
  params: UseBrowserPanelHandlersParams,
): UseBrowserPanelHandlersResult {
  const {
    browserOpenTab,
    browserNavigateActiveTab,
    browserSelectTab,
    browserNavigateInPlace,
    setBrowserNavigateInPlace,
    expectedNavigationUrlRef,
  } = params;

  const pendingNavigationsRef = useRef(new Set<string>());

  const handleNavigationStart = useCallback((url: string) => {
    // Track pending navigation so handlePageMeta creates tab only when real title arrives
    pendingNavigationsRef.current.add(url);
  }, []);

  const handleOpenTabFromTree = useCallback(
    (url: string, tabId?: string) => {
      if (tabId) {
        // Clicking an existing tab → switch to it (unaffected by toggle)
        browserSelectTab(tabId);
        return;
      }
      // 显式导航入口（书签/历史树点击）：记录期望导航 URL，供 onUrlChanged
      // 检测跨域重定向（Chrome/Edge 重定向链消化语义）。切到已有 tab 不设置。
      expectedNavigationUrlRef.current = { url, at: Date.now() };
      if (browserNavigateInPlace) {
        // "Current tab" mode → navigate within the active tab
        browserNavigateActiveTab(url);
      } else {
        // "New tab" mode → open a new tab
        browserOpenTab(url, url);
      }
    },
    [
      browserOpenTab,
      browserNavigateActiveTab,
      browserSelectTab,
      browserNavigateInPlace,
      expectedNavigationUrlRef,
    ],
  );

  const handleToggleNavigateMode = useCallback(
    (checked: boolean) => {
      setBrowserNavigateInPlace(checked);
    },
    [setBrowserNavigateInPlace],
  );

  // "已打开的标签"模式下的 "+" 按钮：始终新建标签页，不受 browserNavigateInPlace 影响。
  // 与 handleOpenTabFromTree（受开关影响）语义区分。
  const handleAlwaysNewTab = useCallback(
    (title: string) => {
      browserOpenTab(undefined, title);
    },
    [browserOpenTab],
  );

  const handlePointerDown = useCallback((_e: React.PointerEvent) => {}, []);

  return {
    pendingNavigationsRef,
    handleNavigationStart,
    handleOpenTabFromTree,
    handleToggleNavigateMode,
    handleAlwaysNewTab,
    handlePointerDown,
  };
}
