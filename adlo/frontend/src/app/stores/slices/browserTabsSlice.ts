import type { StoreState } from '../StoreState';
import { createUiId } from '../shared';
import { persist } from '../persisted/persist';
import { applyTabPrune } from '../persisted/pruneWiring';
import type { BrowserTabState, BrowserTabStateUpdate } from './browserSliceShared';
import { bookmarkUrlKey, isRealTitle } from '@utils/browserDisplayUtils';
import type { BrowserNewTabRequest } from '@shared/ipc/browser';
import { resolveNewWindowTabHost } from '@features/browser/newWindowTabRouting';
import { rememberDownloadSource } from '@features/browser/downloadOnlyTabs';

// Re-export the tab state types from the shared leaf module so existing
// consumers (e.g. tests, browserSlice, browserFoldersUtils) keep working
// without import-source churn. The canonical definitions live in
// `./browserSliceShared` to break the cross-slice type import cycle.
export type { BrowserTabState, BrowserTabStateUpdate } from './browserSliceShared';

function sortTabs(tabs: BrowserTabState[]): BrowserTabState[] {
  return [...tabs].sort((a, b) => {
    if (a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1;
    }
    return a.sortOrder - b.sortOrder;
  });
}

function buildTabsById(tabs: BrowserTabState[]): Record<string, BrowserTabState> {
  const result: Record<string, BrowserTabState> = {};
  for (const tab of tabs) {
    result[tab.id] = tab;
  }
  return result;
}

export interface BrowserTabsSlice {
  browserTabs: BrowserTabState[];
  browserTabsById: Record<string, BrowserTabState>;
  browserActiveTabId: string;
  /** 本会话新建、尚未由 WebView 生命周期消费的标签（transient，不持久化）。 */
  browserFreshTabIds: ReadonlySet<string>;
  /**
   * 本会话新标签待使用的 referrer 值（tab id → referrer：默认策略下同源为去
   * fragment 的完整 URL、跨源为 origin；transient，不持久化）。由页面内新窗口
   * 请求登记，WebView 创建时一次性消费，用于首次导航的 Referer 头。
   */
  browserTabReferrers: Readonly<Record<string, string>>;

  browserOpenTab: (url?: string, title?: string, workspaceId?: string, folderId?: string) => void;
  /**
   * 页面内新窗口请求（`target="_blank"` / `window.open`）：按发起标签所在宿主
   * 开新标签（中心 → 中心标签条，面板 → 面板），并登记 fresh 标记。
   */
  browserOpenNewWindowTab: (request: BrowserNewTabRequest) => void;
  /** 登记一次性 referrer（默认策略下同源完整 URL / 跨源 origin，由页面新窗口请求计算）。 */
  browserSetTabReferrer: (tabId: string, referrer: string) => void;
  /** 读取并清除一次性 referrer；无登记返回 undefined。 */
  browserConsumeTabReferrer: (tabId: string) => string | undefined;
  /** 登记一次性 fresh 标记，供 WebView 生命周期跳过重启下载抑制。 */
  browserMarkTabFresh: (tabId: string) => void;
  /** 读取并清除 fresh 标记；返回该标签是否为本会话新建。 */
  browserConsumeTabFresh: (tabId: string) => boolean;
  browserSelectTab: (tabId: string) => void;
  browserCloseTab: (tabId: string) => void;
  browserUpdateTab: (tabId: string, patch: Partial<BrowserTabStateUpdate>) => void;
  browserTogglePin: (tabId: string) => void;
  browserReorderTabs: (newOrder: BrowserTabState[]) => void;
  browserCloseAllTabs: (workspaceId?: string) => void;
  browserSetLocation: (tabId: string, location: 'panel' | 'center') => void;
  browserUpdateTabAudioState: (tabId: string, isPlaying?: boolean, isMuted?: boolean) => void;
  browserToggleTabMute: (tabId: string) => void;
}

export const createBrowserTabsSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  get: () => StoreState,
): BrowserTabsSlice => ({
  browserTabs: [],
  browserTabsById: {},
  browserActiveTabId: '',
  browserFreshTabIds: new Set<string>(),
  browserTabReferrers: {},

  browserOpenTab: (url?: string, title?: string, workspaceId?: string, folderId?: string) => {
    // 注意：新建标签会同步把全局活动切到新标签（含中心语境调用者，如着陆页/入口页）。
    // 中心视图持有自己的 browserTabId，不依赖全局活动；面板提交等链路若需面板归属
    // 判定，必须显式过滤 location（见 browserNavigatePanelTab），不得 assume 全局活动即面板。
    set((state) => {
      const maxSortOrder =
        state.browserTabs.length > 0 ? Math.max(...state.browserTabs.map((t) => t.sortOrder)) : 0;
      const tabTitle = title?.trim() || '';
      const tab: BrowserTabState = {
        id: createUiId('browser'),
        workspaceId: workspaceId ?? '',
        title: tabTitle,
        url: url?.trim() || '',
        // 已知真实非占位标题（书签/快捷站点/文件夹恢复）视为已结算，避免闪扫光（M1-E）；
        // 占位/空标题保持未结算，等真实标题到达。
        titleResolved: isRealTitle(tabTitle, url?.trim() ?? ''),
        isPinned: false,
        sortOrder: maxSortOrder + 1,
        isPlayingAudio: false,
        isAudioMuted: false,
        isDownloading: false,
        // 快照该标签创建时的共享 profile 选择；设置切换只影响此后新建的标签。
        shareProfile: state.browserShareProfile,
      };
      const nextTabs = sortTabs([...state.browserTabs, tab]);
      let nextFolders = state.browserBookmarkFolders ?? [];
      if (folderId) {
        const now = Date.now();
        nextFolders = nextFolders.map((f) => {
          if (f.id === folderId) {
            const existingEntries = f.entries || [];
            const tabTitle = tab.title?.trim() || tab.url?.trim() || '';
            const entryKey = bookmarkUrlKey(tab.url || '');
            if (
              !existingEntries.some(
                (entry) => bookmarkUrlKey(entry.url || '') === entryKey && entry.title === tabTitle,
              )
            ) {
              return {
                ...f,
                entries: [
                  ...existingEntries,
                  {
                    id: createUiId('bookmark'),
                    url: tab.url || '',
                    title: tabTitle,
                    addedAt: now,
                    lastModifiedAt: now,
                    sourceTabId: tab.id,
                  },
                ],
              };
            }
          }
          return f;
        });
        persist('adl:browser.bookmarkFolders', nextFolders);
      }
      persist('adl:browser.tabs', nextTabs);
      persist('adl:browser.activeTabId', tab.id);
      return {
        browserTabs: nextTabs,
        browserTabsById: buildTabsById(nextTabs),
        browserActiveTabId: tab.id,
        browserBookmarkFolders: nextFolders,
        browserBookmarks: state.browserBookmarks,
      };
    });
    // Chrome/Edge 语义：显式打开一个 URL（书签/快捷站点/右键新标签/文件夹恢复）即一次
    // 导航，应记录历史。browserOpenTab 预置 tab.url 后，导航完成时 onUrlChanged 的
    // urlChanged 判定为 false（tab 已在该 URL），历史写入不能依赖该事件，必须在打开
    // 入口同步写入（与地址栏提交 browserAddToHistory 语义一致；browserAddToHistory 的
    // 同日同 dedupKey 去重保证恢复/重复打开不产生重复条目）。
    const trimmedUrl = url?.trim();
    if (trimmedUrl) {
      get().browserAddToHistory(trimmedUrl, title?.trim() || trimmedUrl);
    }
  },

  browserSelectTab: (tabId) => {
    persist('adl:browser.activeTabId', tabId);
    set({ browserActiveTabId: tabId });
  },

  browserOpenNewWindowTab: ({ tabId, url, referrer }) => {
    if (!url) {
      return;
    }
    const state = get();
    const host = resolveNewWindowTabHost(tabId, state.browserTabsById, state.browserTabs);
    // browserOpenTab 会同步把新标签设为全局活动并落盘；中心来源随后移入中心标签条，
    // centerShowBrowserTab 会把面板活动 id 夹回面板标签。
    state.browserOpenTab(url);
    const newTabId = get().browserActiveTabId;
    if (host === 'center') {
      get().centerShowBrowserTab(newTabId);
    }
    if (newTabId && referrer) {
      get().browserSetTabReferrer(newTabId, referrer);
    }
    get().browserMarkTabFresh(newTabId);
    // 下载链接的新标签：若最终是下载导航，生命周期会把焦点切回来源标签。
    rememberDownloadSource(newTabId, tabId);
  },

  browserSetTabReferrer: (tabId, referrer) =>
    set((state) => ({
      browserTabReferrers: { ...state.browserTabReferrers, [tabId]: referrer },
    })),

  browserConsumeTabReferrer: (tabId) => {
    const referrer = get().browserTabReferrers[tabId];
    if (referrer === undefined) {
      return undefined;
    }
    set((state) => {
      const { [tabId]: _removed, ...rest } = state.browserTabReferrers;
      return { browserTabReferrers: rest };
    });
    return referrer;
  },

  browserMarkTabFresh: (tabId) =>
    set((state) => ({ browserFreshTabIds: new Set(state.browserFreshTabIds).add(tabId) })),

  browserConsumeTabFresh: (tabId) => {
    const fresh = get().browserFreshTabIds;
    if (!fresh.has(tabId)) {
      return false;
    }
    const next = new Set(fresh);
    next.delete(tabId);
    set({ browserFreshTabIds: next });
    return true;
  },

  // 不变量（事项 6/M5）：`browserActiveTabId` 恒为面板活动标签 id（可空），永不指向
  // 中心标签；中心活动由各中心视图自持（如 CenterBrowserView 的 browserTabId）。
  // 读全局活动 id 的面板外链路若需面板语义，必须显式过滤 location（见
  // browserNavigatePanelTab），不得 assume 全局活动即面板。
  browserCloseTab: (tabId) => {
    set((state) => {
      const filtered = state.browserTabs.filter((tab) => tab.id !== tabId);
      const nextTabs = sortTabs(filtered);
      // 关闭回退只取面板标签：中心标签不得成为全局活动标签（与 browserCloseAllTabs
      // “不得指向中心标签”同规则），否则面板提交链路会误导航中心标签（事项 6）。
      // 取末（≈最近使用）；面板展示 fallback 取首（≈稳定默认），职责不同，不要"统一"。
      const panelTabs = nextTabs.filter((tab) => tab.location !== 'center');
      const nextActive =
        state.browserActiveTabId === tabId
          ? (panelTabs[panelTabs.length - 1]?.id ?? '')
          : state.browserActiveTabId;

      persist('adl:browser.tabs', nextTabs);
      persist('adl:browser.activeTabId', nextActive);
      const { [tabId]: _closedReferrer, ...remainingReferrers } = state.browserTabReferrers;
      return {
        browserTabs: nextTabs,
        browserTabsById: buildTabsById(nextTabs),
        browserActiveTabId: nextActive,
        browserTabReferrers: remainingReferrers,
      };
    });
    // 标签集合变化：剪掉已不存在标签的孤儿条目（规格 §3.5.1）。
    applyTabPrune();
  },

  browserUpdateTab: (tabId, patch) =>
    set((state) => {
      const nextTabs = sortTabs(
        state.browserTabs.map((tab) => (tab.id === tabId ? { ...tab, ...patch } : tab)),
      );
      persist('adl:browser.tabs', nextTabs);
      return { browserTabs: nextTabs, browserTabsById: buildTabsById(nextTabs) };
    }),

  browserSetLocation: (tabId, location) =>
    set((state) => {
      const nextTabs = sortTabs(
        state.browserTabs.map((tab) => (tab.id === tabId ? { ...tab, location } : tab)),
      );
      persist('adl:browser.tabs', nextTabs);
      return { browserTabs: nextTabs, browserTabsById: buildTabsById(nextTabs) };
    }),

  browserUpdateTabAudioState: (tabId, isPlaying, isMuted) =>
    set((state) => {
      const nextTabs = state.browserTabs.map((tab) => {
        if (tab.id !== tabId) {
          return tab;
        }
        const next = { ...tab };
        if (isPlaying !== undefined) {
          next.isPlayingAudio = isPlaying;
        }
        if (isMuted !== undefined) {
          next.isAudioMuted = isMuted;
        }
        return next;
      });
      const hasMuteChange = isMuted !== undefined;
      if (hasMuteChange) {
        persist('adl:browser.tabs', nextTabs);
      }
      return { browserTabs: nextTabs, browserTabsById: buildTabsById(nextTabs) };
    }),

  browserToggleTabMute: (tabId) =>
    set((state) => {
      const nextTabs = state.browserTabs.map((tab) =>
        tab.id === tabId ? { ...tab, isAudioMuted: !tab.isAudioMuted } : tab,
      );
      persist('adl:browser.tabs', nextTabs);
      return { browserTabs: nextTabs, browserTabsById: buildTabsById(nextTabs) };
    }),

  browserTogglePin: (tabId) =>
    set((state) => {
      const nextTabs = sortTabs(
        state.browserTabs.map((tab) => {
          if (tab.id === tabId) {
            return {
              ...tab,
              isPinned: !tab.isPinned,
              pinnedAt: !tab.isPinned ? Date.now() : undefined,
            };
          }
          return tab;
        }),
      );
      persist('adl:browser.tabs', nextTabs);
      return { browserTabs: nextTabs, browserTabsById: buildTabsById(nextTabs) };
    }),

  browserReorderTabs: (newOrder) =>
    set((state) => {
      if (state.browserTabs === newOrder) {
        return state;
      }

      const pinnedTabs = newOrder.filter((t) => t.isPinned);
      const unpinnedTabs = newOrder.filter((t) => !t.isPinned);

      const reorderedWithSort = [...pinnedTabs, ...unpinnedTabs].map((tab, index) => ({
        ...tab,
        sortOrder: index,
      }));

      persist('adl:browser.tabs', reorderedWithSort);
      return {
        browserTabs: reorderedWithSort,
        browserTabsById: buildTabsById(reorderedWithSort),
      };
    }),

  browserCloseAllTabs: (workspaceId) => {
    set((state) => {
      const kept = state.browserTabs.filter((tab) => {
        if (tab.location === 'center') {
          return true; // 中心标签不受面板清空影响
        }
        if (workspaceId) {
          return tab.workspaceId !== workspaceId;
        }
        return false; // 全局清空：移除所有面板标签
      });
      // 面板清空只重夹面板活动标签：回退取最后一个**面板**标签；无面板标签（仅剩中心
      // 标签或全空）时清空为 ''，不得指向中心标签。
      const panelKept = kept.filter((tab) => tab.location !== 'center');
      const nextActive = panelKept.some((t) => t.id === state.browserActiveTabId)
        ? state.browserActiveTabId
        : (panelKept[panelKept.length - 1]?.id ?? '');
      persist('adl:browser.tabs', kept);
      persist('adl:browser.activeTabId', nextActive);
      const keptIds = new Set(kept.map((tab) => tab.id));
      const nextReferrers = Object.fromEntries(
        Object.entries(state.browserTabReferrers).filter(([tabId]) => keptIds.has(tabId)),
      );
      return {
        browserTabs: kept,
        browserTabsById: buildTabsById(kept),
        browserActiveTabId: nextActive,
        browserTabReferrers: nextReferrers,
      };
    });
    // 同 browserCloseTab：批量关闭同样产生孤儿标签条目。
    applyTabPrune();
  },
});
