import type { BrowserTabState } from '@stores/slices/browserSlice';
import type { PageMeta } from '@shared/ipc/browser';
import { useBrowserPageMeta } from './useBrowserPageMeta';
import type { MetaSource } from './useBrowserPageMeta';
import { useBrowserMetaSubscription } from './useBrowserMetaSubscription';
import { useBrowserUrlChange } from './useBrowserUrlChange';

export interface UseBrowserPanelMetaWiringParams {
  activeTab: BrowserTabState | undefined;
  activeTabRef: React.MutableRefObject<BrowserTabState | undefined>;
  iframeRef: React.MutableRefObject<HTMLIFrameElement | null>;
  expectedNavigationUrlRef: React.MutableRefObject<string | null>;
  pendingNavigationsRef: React.MutableRefObject<Set<string>>;
  webViewSelfNavigatedRef: React.MutableRefObject<Set<string>>;
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
  const { markUrlSeen, pendingNavigationsRef } = params;

  const { handlePageMeta: _handlePageMeta } = useBrowserPageMeta(
    pendingNavigationsRef,
    markUrlSeen,
  );

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
    webViewSelfNavigatedRef: params.webViewSelfNavigatedRef,
  });

  return {
    handleIframeLoad,
    handleIframeError,
    handlePageMeta: _handlePageMeta,
  };
}
