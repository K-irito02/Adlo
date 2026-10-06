import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { isRealTitle } from '@utils/browserDisplayUtils';
import { findInBrowserLookupIndex } from '@features/browser/useBrowserSearch';
import { checkEmbed, isEmbedBlocked } from '@features/browser/checkEmbed';
import { isSearchQuery, buildSearchUrl, ensureProtocol } from '@features/browser/browserUrlUtils';

interface UseCenterBrowserAddressSubmitParams {
  /** 被中心宿主承载的浏览器标签 id（导航目标）。 */
  browserTabId: string;
  address: string;
  setAddress: (address: string) => void;
  setSearchQueryDisplay: (query: string) => void;
  browserLookupIndex: { title: string; url: string }[];
  /** 浏览器模式：驱动当前中心标签的 iframe 导航。 */
  navigateBrowser: (url: string) => void;
  /** Tauri 模式：显式导航已入池的原生 WebView。 */
  navigateTabInPool: (tabId: string, url: string) => Promise<void>;
  isTabInPool: (tabId: string) => boolean;
  setIframeLoadError: Dispatch<SetStateAction<boolean>>;
  setIframeBlockedDetected: Dispatch<SetStateAction<boolean>>;
  validatedUrlsRef: MutableRefObject<Set<string>>;
}

/**
 * 中心浏览器视图专用地址栏提交逻辑。
 *
 * 不复用 `useBrowserPanelAddressSubmit`：后者写死 `browserActiveTabId`（全局活动
 * 标签，可能与中心承载的标签不同），并在浏览器模式下无条件导航面板 iframe；
 * 还会把期望导航写入面板级 ref。中心需要以传入的 `browserTabId` 为目标。
 * 因此这里复用 URL 解析工具
 * （`browserUrlUtils` / `findInBrowserLookupIndex` / `checkEmbed`）与共享池，
 * 实现等价的最小逻辑。
 *
 * 中心恒为"当前标签"模式（事项 7）：提交一律就地导航当前中心标签，不跟随
 * 面板"新建标签/当前标签"开关（`browserNavigateInPlace`），也不新建标签。
 */
export function useCenterBrowserAddressSubmit({
  browserTabId,
  address,
  setAddress,
  setSearchQueryDisplay,
  browserLookupIndex,
  navigateBrowser,
  navigateTabInPool,
  isTabInPool,
  setIframeLoadError,
  setIframeBlockedDetected,
  validatedUrlsRef,
}: UseCenterBrowserAddressSubmitParams): { submitAddress: () => Promise<void> } {
  const submitAddress = useCallback(async () => {
    const state = useAppStore.getState();
    const input = address.trim();

    if (!input) {
      const tab = state.browserTabsById[browserTabId];
      const currentUrl = tab?.url ?? '';
      setAddress(currentUrl === 'about:blank' ? '' : currentUrl);
      return;
    }

    const matchedItem = findInBrowserLookupIndex(browserLookupIndex, input);
    let finalUrl: string;
    let searchInfo: { engineName: string; query: string } | undefined;

    if (matchedItem?.url) {
      finalUrl = matchedItem.url;
    } else if (isSearchQuery(input)) {
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

    let blocked = false;
    if (!state.isTauri) {
      const cached = isEmbedBlocked(finalUrl);
      if (cached !== undefined) {
        blocked = cached;
      } else {
        // checkEmbed 走网络预检：失败（离线/代理异常）不得阻断导航，按"未拦截"继续。
        try {
          blocked = await checkEmbed(finalUrl);
        } catch (e) {
          console.warn('[centerAddressSubmit] checkEmbed failed, treating as embeddable:', e);
          blocked = false;
        }
      }
    }

    setAddress(finalUrl);
    setSearchQueryDisplay(searchInfo ? searchInfo.query : '');
    const title = searchInfo ? `${searchInfo.engineName}: ${searchInfo.query}` : undefined;

    if (searchInfo) {
      state.browserAddToHistory(finalUrl, title!);
    }

    // 中心恒就地：直接更新当前中心标签并导航其 WebView/iframe，不新建标签。
    useAppStore.getState().browserUpdateTab(browserTabId, {
      url: finalUrl,
      ...(title ? { title, titleResolved: isRealTitle(title, finalUrl) } : {}),
    });

    if (state.isTauri) {
      if (isTabInPool(browserTabId)) {
        await navigateTabInPool(browserTabId, finalUrl).catch((err) => {
          console.warn('[centerAddressSubmit] navigateTabInPool failed:', err);
        });
      }
      return;
    }

    if (blocked) {
      setIframeBlockedDetected(true);
      setIframeLoadError(true);
      return;
    }
    validatedUrlsRef.current.add(finalUrl);
    navigateBrowser(finalUrl);
  }, [
    address,
    browserTabId,
    browserLookupIndex,
    isTabInPool,
    navigateBrowser,
    navigateTabInPool,
    setIframeLoadError,
    setIframeBlockedDetected,
    setAddress,
    setSearchQueryDisplay,
    validatedUrlsRef,
  ]);

  return { submitAddress };
}
