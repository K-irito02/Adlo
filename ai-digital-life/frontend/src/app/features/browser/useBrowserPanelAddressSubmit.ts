import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { findInBrowserLookupIndex } from './useBrowserSearch';
import { routeLocalUrl } from './browser-landing/localAuthPorts';
import { checkEmbed, isEmbedBlocked } from './checkEmbed';
import { isSearchQuery, buildSearchUrl, ensureProtocol } from './browserUrlUtils';
import type { ExpectedNavigationRef } from './browserUrlUtils';
import type { MetaSource, PageMeta } from '@shared/ipc/browser';
import type { CopyDict } from '@i18n';
import { pageMetaClient } from '@utils/pageMetaClient';
import { resolveDshAuthUrl, notifyDshFreedPort } from '@features/dsh/dshAuthUrl';

interface UseBrowserPanelAddressSubmitParams {
  address: string;
  setAddress: (address: string) => void;
  setSearchQueryDisplay: (query: string) => void;
  browserLookupIndex: { title: string; url: string }[];
  handleNavigationStart: (url: string) => void;
  expectedNavigationUrlRef: ExpectedNavigationRef;
  navigateBrowser: (url: string) => void;
  /** 面板归属显式导航（只认面板标签，无则新建；绝不碰中心标签）。 */
  browserNavigatePanelTab: (url: string, title?: string) => void;
  setIframeLoadError: Dispatch<SetStateAction<boolean>>;
  setIframeBlockedDetected: Dispatch<SetStateAction<boolean>>;
  handlePageMeta: (meta: PageMeta, source?: MetaSource) => void;
  addressSubmittedForTabRef: MutableRefObject<string>;
  submitVersionRef: MutableRefObject<number>;
  validatedUrlsRef: MutableRefObject<Set<string>>;
  /** 全量文案（调用点传入面板 `t`）：仅用于残留端口释放告知，缺省不提示。 */
  t?: Pick<CopyDict, 'dshPortFreed'>;
}

export function useBrowserPanelAddressSubmit({
  address,
  setAddress,
  setSearchQueryDisplay,
  browserLookupIndex,
  handleNavigationStart,
  expectedNavigationUrlRef,
  navigateBrowser,
  browserNavigatePanelTab,
  setIframeLoadError,
  setIframeBlockedDetected,
  handlePageMeta,
  addressSubmittedForTabRef,
  submitVersionRef,
  validatedUrlsRef,
  t,
}: UseBrowserPanelAddressSubmitParams): { submitAddress: () => Promise<void> } {
  const submitAddress = useCallback(async () => {
    const input = address.trim();
    if (!input) {
      const state = useAppStore.getState();
      // 面板归属回填（P1）：空回车只回填面板标签 URL；全局活动指向中心时不回填，
      // 避免把中心 URL 灌进面板地址栏。
      const panelTabs = state.browserTabs.filter((t) => t.location !== 'center');
      const activeTab = panelTabs.find((t) => t.id === state.browserActiveTabId) ?? panelTabs[0];
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

    // 需认证本地端口分流（事项 2）：裸 3080 必 401，先经后端取真实入口
    // （含 `?token=`，首次访问种 cookie）。命中则就地面板 tab 导航到真实
    // 地址（面板归属，不劫持到中间区），并跳过 checkEmbed 预检——HEAD 不带
    // cookie 会 401 误判为“被拦截”。未命中保持原同步行为。
    let targetUrl = finalUrl;
    let authed: { url: string; freedPort: boolean } | null = null;
    if (routeLocalUrl(finalUrl)?.opener === 'dsh') {
      authed = await resolveDshAuthUrl(finalUrl);
      if (submitVersionRef.current !== version) {
        return;
      }
      if (authed?.freedPort && t) {
        notifyDshFreedPort(t);
      }
      targetUrl = authed?.url ?? finalUrl;
    }

    if (!useAppStore.getState().isTauri) {
      const cached = authed ? false : isEmbedBlocked(targetUrl);
      if (cached !== undefined) {
        if (submitVersionRef.current !== version) {
          return;
        }
        if (cached) {
          setIframeBlockedDetected(true);
          setIframeLoadError(true);
        } else {
          validatedUrlsRef.current.add(targetUrl);
        }
        if (!cached) {
          navigateBrowser(targetUrl);
        }
      } else {
        // 中心提交同序：checkEmbed 走网络预检，失败（离线/代理异常）不得阻断导航，
        // 按"未拦截"继续，避免回车无响应 + unhandled rejection。
        let blocked: boolean;
        try {
          blocked = await checkEmbed(targetUrl);
        } catch (e) {
          console.warn('[addressSubmit] checkEmbed failed, treating as embeddable:', e);
          blocked = false;
        }
        if (submitVersionRef.current !== version) {
          return;
        }

        if (blocked) {
          setIframeBlockedDetected(true);
          setIframeLoadError(true);
        } else {
          validatedUrlsRef.current.add(targetUrl);
        }

        if (!blocked) {
          navigateBrowser(targetUrl);
        }
      }
    }

    // Always defer tab creation until real title arrives via handlePageMeta
    handleNavigationStart(targetUrl);
    // 显式导航入口：记录期望导航 URL，供 onUrlChanged 检测跨域重定向
    // （Chrome/Edge 重定向链消化语义）。绑定目标 tab id：地址栏提交导航的是
    // 面板归属 tab（无面板 tab 时 browserNavigatePanelTab 会新建，绝不碰中心标签），
    // 仅该 tab 的 URL 变化参与检测，避免后台 tab 跨站导航在窗口内误触发历史改写。
    // 面板归属预绑定（F1）：浏览器模式不走下面的重绑，预绑定不能用可能指向
    // 中心标签的全局活动 id；无面板标签时置 null（任意事件可消费）。
    const panelState = useAppStore.getState();
    const panelTabsForBind = panelState.browserTabs.filter((t) => t.location !== 'center');
    const panelBindTab =
      panelTabsForBind.find((t) => t.id === panelState.browserActiveTabId) ?? panelTabsForBind[0];
    expectedNavigationUrlRef.current = {
      url: targetUrl,
      at: Date.now(),
      tabId: panelBindTab?.id ?? null,
    };
    if (searchInfo) {
      setSearchQueryDisplay(searchInfo.query);
    } else {
      setSearchQueryDisplay('');
    }
    setAddress(targetUrl);
    if (searchInfo) {
      useAppStore
        .getState()
        .browserAddToHistory(targetUrl, `${searchInfo.engineName}: ${searchInfo.query}`);
    }
    if (useAppStore.getState().isTauri) {
      // 面板归属显式导航：更新 tab.url/新建面板 tab，并对已入池 tab 补一次
      // navigateTabInPool（均在传入的 wrapper 内用最新 id 完成）。
      browserNavigatePanelTab(
        targetUrl,
        searchInfo ? `${searchInfo.engineName}: ${searchInfo.query}` : undefined,
      );
      // O3：无活动 tab 时初始期望 tabId 为 null（任意 tab 事件都可能消费）。
      // browserNavigatePanelTab 已同步创建 tab 并设为活动，回读新 id 重绑期望，
      // 避免后台 tab 事件在窗口内抢先消费（与树点击 F7 的行为一致）。
      const createdTabId = useAppStore.getState().browserActiveTabId;
      if (createdTabId) {
        expectedNavigationUrlRef.current = { url: targetUrl, at: Date.now(), tabId: createdTabId };
      }
    }

    if (!useAppStore.getState().isTauri && targetUrl) {
      pageMetaClient.get(targetUrl).then((meta) => {
        if (!meta) {
          useAppStore.getState().browserAddToHistory(targetUrl, targetUrl);
          return;
        }
        handlePageMeta(
          {
            title: meta.title || targetUrl,
            favicon: meta.favicon || '',
            faviconDataUri: meta.faviconDataUri || '',
            url: targetUrl,
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
    browserNavigatePanelTab,
    setIframeLoadError,
    setIframeBlockedDetected,
    handlePageMeta,
    setAddress,
    addressSubmittedForTabRef,
    submitVersionRef,
    validatedUrlsRef,
    t,
  ]);

  return { submitAddress };
}
