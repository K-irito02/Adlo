import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { findInBrowserLookupIndex } from './useBrowserSearch';
import { checkEmbed, isEmbedBlocked } from './checkEmbed';
import { isSearchQuery, buildSearchUrl, ensureProtocol } from './browserUrlUtils';
import type { ExpectedNavigationRef } from './browserUrlUtils';
import type { MetaSource, PageMeta } from '@shared/ipc/browser';
import { pageMetaClient } from '@utils/pageMetaClient';

interface UseBrowserPanelAddressSubmitParams {
  address: string;
  setAddress: (address: string) => void;
  setSearchQueryDisplay: (query: string) => void;
  browserLookupIndex: { title: string; url: string }[];
  handleNavigationStart: (url: string) => void;
  expectedNavigationUrlRef: ExpectedNavigationRef;
  navigateBrowser: (url: string) => void;
  browserNavigateActiveTab: (url: string, title?: string) => void;
  setIframeLoadError: Dispatch<SetStateAction<boolean>>;
  setIframeBlockedDetected: Dispatch<SetStateAction<boolean>>;
  handlePageMeta: (meta: PageMeta, source?: MetaSource) => void;
  addressSubmittedForTabRef: MutableRefObject<string>;
  submitVersionRef: MutableRefObject<number>;
  validatedUrlsRef: MutableRefObject<Set<string>>;
}

export function useBrowserPanelAddressSubmit({
  address,
  setAddress,
  setSearchQueryDisplay,
  browserLookupIndex,
  handleNavigationStart,
  expectedNavigationUrlRef,
  navigateBrowser,
  browserNavigateActiveTab,
  setIframeLoadError,
  setIframeBlockedDetected,
  handlePageMeta,
  addressSubmittedForTabRef,
  submitVersionRef,
  validatedUrlsRef,
}: UseBrowserPanelAddressSubmitParams): { submitAddress: () => Promise<void> } {
  const submitAddress = useCallback(async () => {
    const input = address.trim();
    if (!input) {
      const state = useAppStore.getState();
      const activeTab = state.browserTabs.find((t) => t.id === state.browserActiveTabId);
      const currentUrl = activeTab?.url ?? '';
      addressSubmittedForTabRef.current = currentUrl || 'about:blank';
      setAddress(currentUrl === 'about:blank' ? '' : currentUrl);
      return;
    }

    addressSubmittedForTabRef.current = '';
    const matchedItem = findInBrowserLookupIndex(browserLookupIndex, input);
    let finalUrl: string;
    let searchInfo: { engineName: string; query: string } | undefined;

    if (matchedItem?.url) {
      finalUrl = matchedItem.url;
    } else if (isSearchQuery(input)) {
      const state = useAppStore.getState();
      const engine =
        state.searchEngines.find((e) => e.id === state.defaultSearchEngineId) ??
        state.searchEngines[0];
      if (engine) {
        finalUrl = buildSearchUrl(engine, input);
        searchInfo = { engineName: engine.name, query: input };
      } else {
        finalUrl = ensureProtocol(input);
      }
    } else {
      finalUrl = ensureProtocol(input);
    }

    const version = ++submitVersionRef.current;

    if (!useAppStore.getState().isTauri) {
      const cached = isEmbedBlocked(finalUrl);
      if (cached !== undefined) {
        if (submitVersionRef.current !== version) {
          return;
        }
        if (cached) {
          setIframeBlockedDetected(true);
          setIframeLoadError(true);
        } else {
          validatedUrlsRef.current.add(finalUrl);
        }
        if (!cached) {
          navigateBrowser(finalUrl);
        }
      } else {
        const blocked = await checkEmbed(finalUrl);
        if (submitVersionRef.current !== version) {
          return;
        }

        if (blocked) {
          setIframeBlockedDetected(true);
          setIframeLoadError(true);
        } else {
          validatedUrlsRef.current.add(finalUrl);
        }

        if (!blocked) {
          navigateBrowser(finalUrl);
        }
      }
    }

    // Always defer tab creation until real title arrives via handlePageMeta
    handleNavigationStart(finalUrl);
    // 显式导航入口：记录期望导航 URL，供 onUrlChanged 检测跨域重定向
    // （Chrome/Edge 重定向链消化语义）。绑定目标 tab id：地址栏提交导航的是
    // 当前活动 tab（无 tab 时 browserNavigateActiveTab 会新建），仅该 tab 的
    // URL 变化参与检测，避免后台 tab 跨站导航在窗口内误触发历史改写。
    const activeTabId = useAppStore.getState().browserActiveTabId;
    expectedNavigationUrlRef.current = {
      url: finalUrl,
      at: Date.now(),
      tabId: activeTabId || null,
    };
    if (searchInfo) {
      setSearchQueryDisplay(searchInfo.query);
    } else {
      setSearchQueryDisplay('');
    }
    setAddress(finalUrl);
    if (searchInfo) {
      useAppStore
        .getState()
        .browserAddToHistory(finalUrl, `${searchInfo.engineName}: ${searchInfo.query}`);
    }
    if (useAppStore.getState().isTauri) {
      browserNavigateActiveTab(
        finalUrl,
        searchInfo ? `${searchInfo.engineName}: ${searchInfo.query}` : undefined,
      );
    }

    if (!useAppStore.getState().isTauri && finalUrl) {
      pageMetaClient.get(finalUrl).then((meta) => {
        if (!meta) {
          useAppStore.getState().browserAddToHistory(finalUrl, finalUrl);
          return;
        }
        handlePageMeta(
          {
            title: meta.title || finalUrl,
            favicon: meta.favicon || '',
            faviconDataUri: meta.faviconDataUri || '',
            url: finalUrl,
            // 透传 get 返回的真实来源：否则 effectiveSource 回退硬编码 'http'，
            // com 权威条目被冻结（R3 回归）。
            source: (meta as { source?: MetaSource }).source,
          },
          'http',
        );
      });
    }
  }, [
    address,
    setSearchQueryDisplay,
    browserLookupIndex,
    handleNavigationStart,
    expectedNavigationUrlRef,
    navigateBrowser,
    browserNavigateActiveTab,
    setIframeLoadError,
    setIframeBlockedDetected,
    handlePageMeta,
    setAddress,
    addressSubmittedForTabRef,
    submitVersionRef,
    validatedUrlsRef,
  ]);

  return { submitAddress };
}
