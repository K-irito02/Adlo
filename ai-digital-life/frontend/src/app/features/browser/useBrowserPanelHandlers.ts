import { useCallback, useRef } from 'react';
import type { CopyDict } from '@i18n';
import type { ExpectedNavigationRef } from './browserUrlUtils';
import { routeLocalUrl } from './browser-landing/localAuthPorts';
import { resolveDshAuthUrl, notifyDshFreedPort } from '@features/dsh/dshAuthUrl';

export interface UseBrowserPanelHandlersParams {
  browserOpenTab: (url?: string, title?: string, workspaceId?: string, folderId?: string) => void;
  /** 面板归属显式导航（只认面板标签，无则新建；调用方不得传全局 action）。 */
  browserNavigatePanelTab: (url: string, title?: string) => void;
  browserSelectTab: (tabId: string) => void;
  browserNavigateInPlace: boolean;
  setBrowserNavigateInPlace: (value: boolean) => void;
  getActiveTabId: () => string;
  expectedNavigationUrlRef: ExpectedNavigationRef;
  /** 全量文案（调用点传入面板 `t`）：仅用于残留端口释放告知，缺省不提示。 */
  t?: Pick<CopyDict, 'dshPortFreed'>;
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
    browserNavigatePanelTab,
    browserSelectTab,
    browserNavigateInPlace,
    setBrowserNavigateInPlace,
    getActiveTabId,
    expectedNavigationUrlRef,
    t,
  } = params;

  const pendingNavigationsRef = useRef(new Set<string>());

  const handleNavigationStart = useCallback((url: string) => {
    // Track pending navigation so handlePageMeta creates tab only when real title arrives
    pendingNavigationsRef.current.add(url);
  }, []);

  // 书签/历史树点击的实际导航（面板归属）：与地址栏提交同口径，`targetUrl`
  // 已是真实入口（含 `?token=` 时）或原 URL。
  const openResolvedTabFromTree = useCallback(
    (targetUrl: string) => {
      // 显式导航入口（书签/历史树点击）：记录期望导航 URL + 目标 tab id，
      // 供 onUrlChanged 检测跨域重定向（Chrome/Edge 重定向链消化语义）。
      // - 就地打开：目标即当前活动 tab，绑定真实 id；
      // - 新建标签：browserOpenTab 同步创建新 tab 并设为活动，创建后读取新 id。
      // 绑定真实 tabId 后，后台池化 WebView 的跨站事件不会误吞期望（H1-C）。
      expectedNavigationUrlRef.current = { url: targetUrl, at: Date.now(), tabId: null };
      if (browserNavigateInPlace) {
        // "Current tab" mode → navigate within the panel tab.传入的 wrapper
        // （面板归属）会同步把被导航的面板标签设为活动，调用后回读即为目标 id
        // （面板为空时会新建面板标签，绝不绑定中心标签）。
        browserNavigatePanelTab(targetUrl);
        const targetId = getActiveTabId();
        if (targetId) {
          expectedNavigationUrlRef.current = { url: targetUrl, at: Date.now(), tabId: targetId };
        }
      } else {
        // "New tab" mode → open a new tab
        browserOpenTab(targetUrl, targetUrl);
        const newTabId = getActiveTabId();
        if (newTabId) {
          expectedNavigationUrlRef.current = { url: targetUrl, at: Date.now(), tabId: newTabId };
        }
      }
    },
    [
      browserOpenTab,
      browserNavigatePanelTab,
      browserNavigateInPlace,
      getActiveTabId,
      expectedNavigationUrlRef,
    ],
  );

  const handleOpenTabFromTree = useCallback(
    (url: string, tabId?: string) => {
      if (tabId) {
        // Clicking an existing tab → switch to it (unaffected by toggle)
        browserSelectTab(tabId);
        return;
      }
      // 需认证本地端口分流（事项 2）：裸 3080 必 401，先经后端取真实入口，
      // 再走面板归属导航（就地/新建跟随开关，不劫持到中间区）。
      // 同步快路径：未命中分发表的 URL 保持原同步行为（回归测试依赖同步断言）。
      if (routeLocalUrl(url)?.opener !== 'dsh') {
        openResolvedTabFromTree(url);
        return;
      }
      void (async () => {
        const authed = await resolveDshAuthUrl(url);
        if (authed?.freedPort && t) {
          notifyDshFreedPort(t);
        }
        openResolvedTabFromTree(authed?.url ?? url);
      })();
    },
    [browserSelectTab, openResolvedTabFromTree, t],
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
