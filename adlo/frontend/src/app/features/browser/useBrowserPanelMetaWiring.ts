import type { BrowserTabState } from '@stores/slices/browserSlice';
import type { MetaSource, PageMeta } from '@shared/ipc/browser';
import type { ExpectedNavigationRef } from './browserUrlUtils';
import { handlePageMeta } from './useBrowserPageMeta';
import { useBrowserUrlChange } from './useBrowserUrlChange';

export interface UseBrowserPanelMetaWiringParams {
  activeTab: BrowserTabState | undefined;
  activeTabRef: React.MutableRefObject<BrowserTabState | undefined>;
  iframeRef: React.MutableRefObject<HTMLIFrameElement | null>;
  expectedNavigationUrlRef: ExpectedNavigationRef;
  pendingNavigationsRef: React.MutableRefObject<Set<string>>;
  markUrlSeen: (url: string) => void;
  setAddress: (address: string) => void;
  setSearchQueryDisplay: (query: string) => void;
  setIframeLoadError: React.Dispatch<React.SetStateAction<boolean>>;
  browserNavigatePanelTab: (url: string, title?: string) => void;
  browserUpdateTab: (id: string, data: Partial<BrowserTabState>) => void;
  onNavigationStart: (url: string) => void;
}

export interface UseBrowserPanelMetaWiringResult {
  handleIframeLoad: () => void;
  handleIframeError: () => void;
  handlePageMeta: (meta: PageMeta, source?: MetaSource) => void;
}

export function useBrowserPanelMetaWiring(
  params: UseBrowserPanelMetaWiringParams,
): UseBrowserPanelMetaWiringResult {
  // Task 9: useBrowserPageMeta 已重写为广播处理器，签名无参。
  // pendingNavigationsRef/markUrlSeen 参数保留在接口中（BrowserPanel.tsx 调用处不变），
  // 但不再传递给 useBrowserPageMeta——去重已由服务端 3s 窗口承担（Task 10 收尾时评估移除）。
  //
  // 元数据订阅（onMetaChanged / page-meta-updated）统一由 App 根的
  // useGlobalBrowserMeta 承担：面板未挂载或右侧展示其它工具时，中心宿主标签
  // 也必须能收到标题/图标事件（否则标题停在"新建标签页"）。
  const _handlePageMeta = handlePageMeta;

  const { handleIframeLoad, handleIframeError } = useBrowserUrlChange({
    activeTab: params.activeTab,
    activeTabRef: params.activeTabRef,
    iframeRef: params.iframeRef,
    expectedNavigationUrlRef: params.expectedNavigationUrlRef,
    setAddress: params.setAddress,
    setSearchQueryDisplay: params.setSearchQueryDisplay,
    browserNavigatePanelTab: params.browserNavigatePanelTab,
    browserUpdateTab: params.browserUpdateTab,
    onPageMeta: _handlePageMeta,
    onNavigationStart: params.onNavigationStart,
    markUrlSeen: params.markUrlSeen,
    setIframeLoadError: params.setIframeLoadError,
  });

  return {
    handleIframeLoad,
    handleIframeError,
    handlePageMeta: _handlePageMeta,
  };
}
