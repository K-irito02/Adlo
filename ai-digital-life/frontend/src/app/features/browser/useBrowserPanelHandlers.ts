import { useCallback, useRef } from 'react';
import type { ExpectedNavigationRef } from './browserUrlUtils';

export interface UseBrowserPanelHandlersParams {
  browserOpenTab: (url?: string, title?: string, workspaceId?: string, folderId?: string) => void;
  browserNavigateActiveTab: (url: string, title?: string) => void;
  browserSelectTab: (tabId: string) => void;
  browserNavigateInPlace: boolean;
  setBrowserNavigateInPlace: (value: boolean) => void;
  getActiveTabId: () => string;
  expectedNavigationUrlRef: ExpectedNavigationRef;
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
    getActiveTabId,
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
      // 显式导航入口（书签/历史树点击）：记录期望导航 URL + 目标 tab id，
      // 供 onUrlChanged 检测跨域重定向（Chrome/Edge 重定向链消化语义）。
      // - 就地打开：目标即当前活动 tab，绑定真实 id；
      // - 新建标签：browserOpenTab 同步创建新 tab 并设为活动，创建后读取新 id。
      // 绑定真实 tabId 后，后台池化 WebView 的跨站事件不会误吞期望（H1-C）。
      expectedNavigationUrlRef.current = { url, at: Date.now(), tabId: null };
      if (browserNavigateInPlace) {
        // "Current tab" mode → navigate within the panel tab.传入的 wrapper
        // （面板归属）会同步把被导航的面板标签设为活动，调用后回读即为目标 id
        // （面板为空时会新建面板标签，绝不绑定中心标签）。
        browserNavigateActiveTab(url);
        const targetId = getActiveTabId();
        if (targetId) {
          expectedNavigationUrlRef.current = { url, at: Date.now(), tabId: targetId };
        }
      } else {
        // "New tab" mode → open a new tab
        browserOpenTab(url, url);
        const newTabId = getActiveTabId();
        if (newTabId) {
          expectedNavigationUrlRef.current = { url, at: Date.now(), tabId: newTabId };
        }
      }
    },
    [
      browserOpenTab,
      browserNavigateActiveTab,
      browserSelectTab,
      browserNavigateInPlace,
      getActiveTabId,
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
