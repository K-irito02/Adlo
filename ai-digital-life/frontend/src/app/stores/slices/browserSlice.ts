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
import { createUiId, clamp } from '../shared';
import { isRealTitle } from '@utils/browserDisplayUtils';
import { persistField } from '../persisted/apply';
import { persist } from '../persisted/persist';
import { BROWSER_ZOOM_MIN, BROWSER_ZOOM_MAX } from './browserSliceShared';
import type { BrowserNavigatorMode } from '../../features/browser/useBrowserTabs';
import type { BrowserSearchScope } from '../../features/browser/useBrowserSearch';

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

function buildTabsById(tabs: BrowserTabState[]): Record<string, BrowserTabState> {
  const result: Record<string, BrowserTabState> = {};
  for (const tab of tabs) {
    result[tab.id] = tab;
  }
  return result;
}

export interface BrowserSlice {
  browserNavigateInPlace: boolean;
  browserNavigateActiveTab: (url: string, title?: string) => void;
  /**
   * 面板归属导航（事项 6）：只认 `location !== 'center'` 的面板标签；无面板标签
   * 时新建面板标签。面板提交链路必须用它，绝不能用全局活动 id 导航到中心标签。
   */
  browserNavigatePanelTab: (url: string, title?: string) => void;
  setBrowserNavigateInPlace: (value: boolean) => void;
  /** 导航子视图模式（`adl:browser.navigatorMode`，Task 24） */
  browserNavigatorMode: BrowserNavigatorMode;
  setBrowserNavigatorMode: (mode: BrowserNavigatorMode) => void;
  /** 导航检索范围（`adl:browser.searchScope`，Task 24） */
  browserSearchScope: BrowserSearchScope;
  setBrowserSearchScope: (scope: BrowserSearchScope) => void;
  /**
   * 树选中项（`adl:browser.selectedTreePath`，Task 24；null = 无选中）。
   * "点击外部即清空"行为保留：清空同样落盘（null），否则重启会高亮已放弃的项。
   */
  browserSelectedTreePath: string | null;
  setBrowserSelectedTreePath: (path: string | null) => void;
  /** 每标签缩放（`adl:browser.zoomByTab`，Task 24；无记录标签取 1.0） */
  browserZoomByTab: Record<string, number>;
  setBrowserZoomByTab: (tabId: string, zoom: number) => void;
}

export const createBrowserSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): BrowserSlice => {
  return {
    browserNavigateInPlace: false,
    browserNavigatorMode: 'tabs',
    browserSearchScope: 'all',
    browserSelectedTreePath: null,
    browserZoomByTab: {},

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

    browserNavigatePanelTab: (url: string, title?: string) => {
      set((state) => {
        // 与面板 `activeTab` 口径一致（`useBrowserTabs`）：全局活动 id 命中面板标签
        // 则用它，否则回退第一个面板标签；无面板标签则新建（绝不碰中心标签）。
        const panelTabs = state.browserTabs.filter((tab) => tab.location !== 'center');
        let activeTab =
          panelTabs.find((tab) => tab.id === state.browserActiveTabId) ?? panelTabs[0];
        let nextTabs = state.browserTabs;
        let nextActiveTabId = activeTab?.id ?? state.browserActiveTabId;

        if (!activeTab) {
          const maxSortOrder =
            nextTabs.length > 0 ? Math.max(...nextTabs.map((t) => t.sortOrder)) : 0;
          const tabTitle = title?.trim() || '';
          const newTab: BrowserTabState = {
            id: createUiId('browser'),
            workspaceId: '',
            title: tabTitle,
            url,
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
          const targetId = activeTab.id;
          nextTabs = nextTabs.map((tab) => {
            if (tab.id === targetId) {
              return {
                ...tab,
                url,
                title: title || '',
                titleResolved: isRealTitle(tabTitle, url),
              };
            }
            return tab;
          });
          nextActiveTabId = activeTab.id;
          persist('adl:browser.tabs', nextTabs);
          persist('adl:browser.activeTabId', nextActiveTabId);
        }

        return {
          browserTabs: nextTabs,
          browserTabsById: buildTabsById(nextTabs),
          browserActiveTabId: nextActiveTabId,
        };
      });
    },

    setBrowserNavigateInPlace: (value: boolean) => {
      set(persistField('adl:browser.navigateInPlace', value));
    },
    setBrowserNavigatorMode: (mode) => {
      set(persistField('adl:browser.navigatorMode', mode));
    },
    setBrowserSearchScope: (scope) => {
      set(persistField('adl:browser.searchScope', scope));
    },
    setBrowserSelectedTreePath: (path) => {
      set(persistField('adl:browser.selectedTreePath', path));
    },
    setBrowserZoomByTab: (tabId, zoom) =>
      set((state) =>
        persistField('adl:browser.zoomByTab', {
          ...state.browserZoomByTab,
          // 写侧钳制与读侧 readZoomByTab 同源（常量见 browserSliceShared）
          [tabId]: clamp(zoom, BROWSER_ZOOM_MIN, BROWSER_ZOOM_MAX),
        }),
      ),
  };
};
