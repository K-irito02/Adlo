import {
  useCallback,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { useAppStore } from '@stores/slicedStore';
import { isRealTitle } from '@utils/browserDisplayUtils';
import { findInBrowserLookupIndex } from '@features/browser/useBrowserSearch';
import { routeLocalUrl } from '@features/browser/browser-landing/localAuthPorts';
import type { CopyDict } from '@i18n';
import { checkEmbed, isEmbedBlocked } from '@features/browser/checkEmbed';
import { isSearchQuery, buildSearchUrl, ensureProtocol } from '@features/browser/browserUrlUtils';
import { resolveDshAuthUrl, type DshAuthResolution } from '@features/dsh/dshAuthUrl';
import {
  isLocalFileInput,
  buildLocalFileUrl,
  isLocalViewableFileUrl,
} from '@features/browser/localFileInput';

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
  /** 提示文案（本地文件桌面端限制 + 残留端口释放告知）；缺省时不提示。 */
  t?: Pick<
    CopyDict,
    'dshRecovering' | 'dshStarting' | 'browserLocalFileDesktopOnly' | 'browserLocalFileUnsupported'
  >;
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
  t,
}: UseCenterBrowserAddressSubmitParams): { submitAddress: () => Promise<void> } {
  // 与面板同款的提交代际：本地文件分支同步完成，必须让更早的在途提交
  // （DSH 认证 / checkEmbed）落定后失效，否则会覆盖后一次本地文件提交。
  const submitVersionRef = useRef(0);
  const submitAddress = useCallback(async () => {
    const version = ++submitVersionRef.current;
    const state = useAppStore.getState();
    const input = address.trim();

    if (isLocalFileInput(input)) {
      const fileUrl = buildLocalFileUrl(input);
      if (!state.isTauri) {
        if (t) {
          state.showToast(t.browserLocalFileDesktopOnly, 'warning');
        }
        return;
      }
      if (!fileUrl || !isLocalViewableFileUrl(fileUrl)) {
        if (t) {
          state.showToast(t.browserLocalFileUnsupported, 'warning');
        }
        return;
      }
      setAddress(fileUrl);
      setSearchQueryDisplay('');
      state.browserUpdateTab(browserTabId, {
        url: fileUrl,
        title: '',
        titleResolved: false,
      });
      if (state.isTauri && isTabInPool(browserTabId)) {
        await navigateTabInPool(browserTabId, fileUrl).catch((err) => {
          console.warn('[centerAddressSubmit] navigateTabInPool failed:', err);
        });
      }
      return;
    }

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

    // 需认证本地端口分流（事项 2）：裸 3080 必 401，先经后端取真实入口
    // （含 `?token=`，首次访问种 cookie）。命中则跳过 checkEmbed 预检——
    // HEAD 不带 cookie 会 401 误判为“被拦截”。未命中保持原行为。
    let targetUrl = finalUrl;
    let authed: DshAuthResolution = null;
    if (routeLocalUrl(finalUrl)?.opener === 'dsh') {
      authed = await resolveDshAuthUrl(finalUrl, t);
      if (submitVersionRef.current !== version) {
        return;
      }
      if (authed && 'canceled' in authed) {
        return;
      }
      targetUrl = authed?.url ?? finalUrl;
      if (authed) {
        useAppStore.getState().dismissDshRecoveryToast();
      }
    }

    let blocked = false;
    if (!state.isTauri) {
      const cached = authed ? false : isEmbedBlocked(targetUrl);
      if (cached !== undefined) {
        blocked = cached;
      } else {
        // checkEmbed 走网络预检：失败（离线/代理异常）不得阻断导航，按"未拦截"继续。
        try {
          blocked = await checkEmbed(targetUrl);
        } catch (e) {
          console.warn('[centerBrowser] checkEmbed failed, treating as embeddable:', e);
          blocked = false;
        }
      }
    }

    if (submitVersionRef.current !== version) {
      return;
    }

    setAddress(targetUrl);
    setSearchQueryDisplay(searchInfo ? searchInfo.query : '');
    const title = searchInfo ? `${searchInfo.engineName}: ${searchInfo.query}` : undefined;

    if (searchInfo) {
      state.browserAddToHistory(targetUrl, title!);
    }

    // 中心恒就地：直接更新当前中心标签并导航其 WebView/iframe，不新建标签。
    // 连续的主路径提交仍是 last-wins（后一次覆盖前一次）；代际守卫只用于丢弃
    // 更早的在途提交，避免它们覆盖之后同步完成的本地文件提交。
    useAppStore.getState().browserUpdateTab(browserTabId, {
      url: targetUrl,
      ...(title ? { title, titleResolved: isRealTitle(title, targetUrl) } : {}),
    });

    if (state.isTauri) {
      if (isTabInPool(browserTabId)) {
        await navigateTabInPool(browserTabId, targetUrl).catch((err) => {
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
    validatedUrlsRef.current.add(targetUrl);
    navigateBrowser(targetUrl);
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
    t,
  ]);

  return { submitAddress };
}
