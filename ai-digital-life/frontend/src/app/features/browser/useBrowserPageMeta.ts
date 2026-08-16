import { useCallback, useEffect } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { pageMetaClient } from '@utils/pageMetaClient';
import { applyBroadcastUpdate, getCachedTitle } from '@utils/siteMetaCache';
import type { PageMeta, PageMetaUpdatedPayload, MetaSource } from '@shared/ipc/browser';
import { normalizedQueryForDedup } from '@utils/browserDisplayUtils';

// 共享类型收敛（Task 6 注：Task 9 收敛 MetaSource 至 @shared/ipc/browser）。
// 仍保留导出：useBrowserUrlChange.ts / useBrowserPanelAddressSubmit.ts（Task 10 迁移）
// 目前从此模块导入 MetaSource；Task 10 迁移后可移除本重导出。
export type { MetaSource } from '@shared/ipc/browser';

export const titleSourceRef = new Map<string, MetaSource>();

export function isPlaceholderTitle(title: string, url: string): boolean {
  if (!title) return true;
  if (title === url) return true;
  if (/^https?:\/\//i.test(title)) return true;
  try {
    const host = new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
    if (!host) return false;
    const t = title.trim().toLowerCase();
    return t === host || t === `www.${host}`;
  } catch {
    return false;
  }
}

export function applyBroadcastTitle(
  tab: { title: string; id: string },
  url: string,
  broadcastTitle: string,
  source: MetaSource,
  currentSource?: MetaSource,
): boolean {
  if (!broadcastTitle) return false;
  if (broadcastTitle === tab.title) return false;
  if (isPlaceholderTitle(broadcastTitle, url)) return false; // 广播的是占位 → 不应用
  if (isPlaceholderTitle(tab.title, url)) return true;        // 当前是占位 → 应用
  if (source === 'http' || source === 'iframe') return true;
  if (source === 'com') return currentSource === 'com' || currentSource === 'google';
  return false;
}

/**
 * Normalize a URL for tab/URL identity comparison: strip hash + trailing
 * slash, and normalize the query string (tracking params dropped, remaining
 * sorted) so SPA URL variants collapse to the same key.
 */
function normalizeUrlForDedup(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, '') : u.pathname;
    return `${u.protocol}//${u.hostname.toLowerCase()}${path}${normalizedQueryForDedup(u.search)}${u.hash}`;
  } catch {
    return url;
  }
}

function normalizeMetaUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.replace(/\/+$/, '');
    return u.toString();
  } catch {
    const noHash = url.split('#')[0] || url;
    return noHash.length > 8 && noHash.endsWith('/') ? noHash.replace(/\/+$/, '') : noHash;
  }
}

export function useBrowserPageMeta() {
  const applyBroadcast = useCallback((p: PageMetaUpdatedPayload) => {
    applyBroadcastUpdate(p); // 镜像更新（Task 7）
    const state = useAppStore.getState();
    const cleanUrl = normalizeMetaUrl(p.url);
    const matchingTabs = state.browserTabs.filter(
      (t) => normalizeUrlForDedup(normalizeMetaUrl(t.url)) === normalizeUrlForDedup(cleanUrl),
    );
    for (const tab of matchingTabs) {
      const curSource = titleSourceRef.get(tab.id);
      if (applyBroadcastTitle(tab, cleanUrl, p.title, p.source, curSource)) {
        state.browserUpdateTab(tab.id, { title: p.title });
        titleSourceRef.set(tab.id, p.source);
      }
    }
    if (matchingTabs.length > 0 || state.browserHistory.some((h) => h.url === cleanUrl)) {
      state.browserUpdateHistoryTitle(cleanUrl, p.title || getCachedTitle(cleanUrl));
    }
  }, []);

  useEffect(() => pageMetaClient.subscribeUpdated(applyBroadcast), [applyBroadcast]);

  const handlePageMeta = useCallback((meta: PageMeta, source: MetaSource = 'http') => {
    // 本地渲染期事件（iframe/地址栏）：先同步落地 store（保持即时性），再异步上报服务端合并
    applyBroadcastUpdate({ url: meta.url, title: meta.title, faviconUrl: meta.favicon, faviconDataUri: meta.faviconDataUri || '', source });
    const state = useAppStore.getState();
    const cleanUrl = normalizeMetaUrl(meta.url);
    const activeTab = state.browserTabs.find((t) => t.id === state.browserActiveTabId);
    const exact = state.browserTabs.find((t) => normalizeUrlForDedup(normalizeMetaUrl(t.url)) === normalizeUrlForDedup(cleanUrl));
    if (exact) {
      for (const t of state.browserTabs.filter((x) => normalizeUrlForDedup(normalizeMetaUrl(x.url)) === normalizeUrlForDedup(cleanUrl))) {
        if (applyBroadcastTitle(t, cleanUrl, meta.title, source, titleSourceRef.get(t.id))) {
          state.browserUpdateTab(t.id, { title: meta.title });
          titleSourceRef.set(t.id, source);
        }
      }
      state.browserUpdateHistoryTitle(cleanUrl, meta.title || getCachedTitle(cleanUrl));
    } else if (activeTab) {
      const urlChanged = normalizeUrlForDedup(normalizeMetaUrl(activeTab.url)) !== normalizeUrlForDedup(cleanUrl);
      const shouldTitle = !urlChanged && applyBroadcastTitle(activeTab, cleanUrl, meta.title, source, titleSourceRef.get(activeTab.id));
      state.browserUpdateTab(activeTab.id, { url: cleanUrl, title: shouldTitle ? meta.title : activeTab.title });
      if (shouldTitle) titleSourceRef.set(activeTab.id, source);
      state.browserUpdateHistoryTitle(cleanUrl, meta.title || getCachedTitle(cleanUrl));
    }
    void pageMetaClient.report({ url: meta.url, title: meta.title, favicon: meta.favicon }, source);
  }, []);

  return { handlePageMeta };
}
