import type { StoreState } from '../StoreState';
import { createUiId } from '../shared';
import { persist } from '../persisted/persist';
import { applyTabPrune } from '../persisted/pruneWiring';
import type { BrowserTabState, BrowserTabStateUpdate } from './browserSliceShared';
import { historyDedupKey, isRealTitle } from '@utils/browserDisplayUtils';

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

  browserOpenTab: (url?: string, title?: string, workspaceId?: string, folderId?: string) => void;
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
      };
      const nextTabs = sortTabs([...state.browserTabs, tab]);
      let nextFolders = state.browserTabFolders;
      let nextTabIdUrlMap = state.browserBookmarkTabIdUrlMap;
      if (folderId) {
        nextFolders = nextFolders.map((f) => {
          if (f.id === folderId) {
            const existingTabs = f.tabs || [];
            const tabTitle = tab.title?.trim() || tab.url?.trim() || '';
            // 归一化去重（剥离跟踪参数/尾斜杠/www）：URL 变体不产生重复快照条目
            // （2026-08-21 事项 7 审查 A2-6 预存问题）。
            const entryKey = historyDedupKey(tab.url || '');
            if (
              !existingTabs.some(
                (item) => historyDedupKey(item.url || '') === entryKey && item.title === tabTitle,
              )
            ) {
              return {
                ...f,
                tabs: [...existingTabs, { tabId: tab.id, url: tab.url || '', title: tabTitle }],
              };
            }
          }
          return f;
        });
        persist('adl:browser.tabFolders', nextFolders);
        if (tab.url && !nextTabIdUrlMap[tab.id]) {
          nextTabIdUrlMap = { ...nextTabIdUrlMap, [tab.id]: tab.url };
          persist('adl:browser.tabIdUrlMap', nextTabIdUrlMap);
        }
      }
      persist('adl:browser.tabs', nextTabs);
      persist('adl:browser.activeTabId', tab.id);
      return {
        browserTabs: nextTabs,
        browserTabsById: buildTabsById(nextTabs),
        browserActiveTabId: tab.id,
        browserTabFolders: nextFolders,
        browserBookmarkTabIdUrlMap: nextTabIdUrlMap,
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
      return {
        browserTabs: nextTabs,
        browserTabsById: buildTabsById(nextTabs),
        browserActiveTabId: nextActive,
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
      return {
        browserTabs: kept,
        browserTabsById: buildTabsById(kept),
        browserActiveTabId: nextActive,
      };
    });
    // 同 browserCloseTab：批量关闭同样产生孤儿标签条目。
    applyTabPrune();
  },
});
