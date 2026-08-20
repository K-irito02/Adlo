import type { BrowserTabState } from '@stores/slices/browserSlice';
import type { MetaSource, PageMeta } from '@shared/ipc/browser';
import { useBrowserPageMeta } from './useBrowserPageMeta';
import { useBrowserMetaSubscription } from './useBrowserMetaSubscription';
import { useBrowserUrlChange } from './useBrowserUrlChange';

export interface UseBrowserPanelMetaWiringParams {
  activeTab: BrowserTabState | undefined;
  activeTabRef: React.MutableRefObject<BrowserTabState | undefined>;
  iframeRef: React.MutableRefObject<HTMLIFrameElement | null>;
  expectedNavigationUrlRef: React.MutableRefObject<string | null>;
  pendingNavigationsRef: React.MutableRefObject<Set<string>>;
  markUrlSeen: (url: string) => void;
  setAddress: (address: string) => void;
  setIframeLoadError: React.Dispatch<React.SetStateAction<boolean>>;
  browserNavigateActiveTab: (url: string, title?: string) => void;
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
  const { handlePageMeta: _handlePageMeta } = useBrowserPageMeta();

  useBrowserMetaSubscription((meta) => {
    _handlePageMeta(meta, 'com');
  });

  const { handleIframeLoad, handleIframeError } = useBrowserUrlChange({
    activeTab: params.activeTab,
    activeTabRef: params.activeTabRef,
    iframeRef: params.iframeRef,
    expectedNavigationUrlRef: params.expectedNavigationUrlRef,
    setAddress: params.setAddress,
    browserNavigateActiveTab: params.browserNavigateActiveTab,
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
