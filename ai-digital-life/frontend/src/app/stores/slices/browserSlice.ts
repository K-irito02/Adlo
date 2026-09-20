/**
 * 浏览器切片（精简核心层）
 * 包含：核心导航状态、持久化标志、工作区ID
 *
 * 子切片在 slicedStore.ts 中独立注册，本切片不内部组合。
 * BrowserSlice 类型定义自身字段，所有子切片类型单独注册。
 *
 * 持久化（Task 9 迁移完成）：
 * - 写盘统一走 persist() / persistField()（唯一写盘通道）；
 * - 读取统一走 persisted/hydrate.ts 的 hydrateAll()（store 构造期同步执行一次），
 *   跨键归一化（tabs 的 titleResolved 结算、tabId→URL 映射）由
 *   persisted/composite.ts 的 compositeHydrators 在同一时机完成；
 * - 本文件不再持有任何遗留键常量、不再有 requestIdleCallback/setTimeout 延迟水合
 *   （hydrateBrowserDefaults 已删除）。
 */
import type { StoreState } from '../StoreState';
import { clamp, createUiId } from '../shared';
import { isRealTitle } from '@utils/browserDisplayUtils';
import { persistField } from '../persisted/apply';
import { persist } from '../persisted/persist';

import type { BrowserTabState } from './browserSliceShared';

export type { BrowserTabState, BrowserTabStateUpdate } from './browserSliceShared';
export type { BrowserBookmark, WorkspaceBookmarkEntry } from './browserTypes';
export type { BrowserHistoryState } from './browserHistorySlice';
export type { TabFolderState, BookmarkTabItem } from './browserFoldersSlice';
export type {
  ShortcutSite,
  LocalPort,
  BackgroundConfig,
  BackgroundMode,
  BackgroundFit,
} from './browserLandingSlice';

const BROWSER_NAVIGATOR_WIDTH_MIN = 180;
const BROWSER_NAVIGATOR_WIDTH_MAX = 300;
const DEFAULT_BROWSER_NAVIGATOR_WIDTH = 240;

function buildTabsById(tabs: BrowserTabState[]): Record<string, BrowserTabState> {
  const result: Record<string, BrowserTabState> = {};
  for (const tab of tabs) {
    result[tab.id] = tab;
  }
  return result;
}

export interface BrowserSlice {
  browserNavigatorWidth: number;
  browserPersisted: boolean;
  browserWorkspaceId: string;

  browserNavigateInPlace: boolean;
  browserNavigateActiveTab: (url: string, title?: string) => void;
  setBrowserNavigateInPlace: (value: boolean) => void;
  setBrowserNavigatorWidth: (width: number) => void;
  toggleBrowserNavigator: () => void;
  setBrowserNavigatorCollapsed: (collapsed: boolean) => void;
  setBrowserPersisted: (persisted: boolean) => void;
  setBrowserWorkspaceId: (workspaceId: string) => void;
}

export const createBrowserSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): BrowserSlice => {
  return {
    browserNavigatorWidth: DEFAULT_BROWSER_NAVIGATOR_WIDTH,
    browserPersisted: false,
    browserWorkspaceId: '',
    browserNavigateInPlace: false,

    browserNavigateActiveTab: (url: string, title?: string) => {
      set((state) => {
        let activeTab = state.browserTabs.find((tab) => tab.id === state.browserActiveTabId);
        let nextTabs = state.browserTabs;
        let nextActiveTabId = state.browserActiveTabId;

        if (!activeTab || nextTabs.length === 0) {
          const maxSortOrder =
            nextTabs.length > 0 ? Math.max(...nextTabs.map((t) => t.sortOrder)) : 0;
          const tabTitle = title?.trim() || '';
          const newTab: BrowserTabState = {
            id: createUiId('browser'),
            workspaceId: '',
            title: tabTitle,
            url,
            // 真实非占位标题（如 iframe 模式直接拿到的 document.title）视为已结算，
            // 避免浏览器模式扫光永久显示（C1）；搜索/地址栏的占位标题保持未结算。
            titleResolved: isRealTitle(tabTitle, url),
            isPinned: false,
            isPlayingAudio: false,
            isAudioMuted: false,
            sortOrder: maxSortOrder + 1,
            isDownloading: false,
          };
          nextTabs = [...nextTabs, newTab];
          nextActiveTabId = newTab.id;
          activeTab = newTab;
          persist('adl:browser.tabs', nextTabs);
          persist('adl:browser.activeTabId', nextActiveTabId);
        } else {
          const tabTitle = title?.trim() || '';
          nextTabs = nextTabs.map((tab) => {
            if (tab.id === state.browserActiveTabId) {
              return {
                ...tab,
                url,
                title: title || '',
                // 同上：真实非占位标题视为已结算，占位标题保持未结算（C1）
                titleResolved: isRealTitle(tabTitle, url),
              };
            }
            return tab;
          });
          persist('adl:browser.tabs', nextTabs);
        }

        // History entry is created by handlePageMeta (via browserAddToHistory)
        // when it receives the real title from COM/poll. Do NOT create an entry
        // here with URL as placeholder — that would flash a raw URL in the panel.
        return {
          browserTabs: nextTabs,
          browserTabsById: buildTabsById(nextTabs),
          browserActiveTabId: nextActiveTabId,
        };
      });
    },

    setBrowserNavigatorWidth: (width) => {
      const next = clamp(width, BROWSER_NAVIGATOR_WIDTH_MIN, BROWSER_NAVIGATOR_WIDTH_MAX);
      set(persistField('adl:browser.navigatorWidth', next));
    },

    setBrowserNavigateInPlace: (value: boolean) => {
      set(persistField('adl:browser.navigateInPlace', value));
    },

    toggleBrowserNavigator: () =>
      set((state) => {
        const next = {
          ...state.navigatorCollapsedByTool,
          browser: !(state.navigatorCollapsedByTool?.browser ?? false),
        };
        return persistField('adl:ui.navigatorCollapsed', next);
      }),

    setBrowserNavigatorCollapsed: (collapsed) =>
      set((state) => {
        const next = { ...state.navigatorCollapsedByTool, browser: collapsed };
        return persistField('adl:ui.navigatorCollapsed', next);
      }),

    setBrowserPersisted: (persisted) => set({ browserPersisted: persisted }),

    setBrowserWorkspaceId: (workspaceId) => set({ browserWorkspaceId: workspaceId }),
  };
};
