import { isRealTitle } from '@utils/browserDisplayUtils';
import type { StoreState } from '../StoreState';
import type { BrowserTabState } from '../slices/browserSliceShared';
import type { WorkspaceBookmarkEntry } from '../slices/browserTypes';
import type { TabFolderState } from '../slices/browserFoldersSlice';
import { readObjectArray, readObjectArrayRecord, readString, readStringRecord } from './parsers';
import { isBookmarkTabItem, isBrowserTab, isTabFolder } from './registry';

/** 跨键归一化器：需要在简单条目读完之后、基于多个键的共同结果构建补丁 */
export interface CompositeHydrator {
  name: string;
  build: (read: (key: string) => unknown) => Partial<StoreState>;
}

export function markResolvedTitles(tabs: BrowserTabState[]): BrowserTabState[] {
  return tabs.map((tab) => ({
    ...tab,
    titleResolved:
      typeof tab.titleResolved === 'boolean'
        ? tab.titleResolved
        : isRealTitle(tab.title, tab.url ?? ''),
  }));
}

export function buildBrowserTabUrlMap(input: {
  tabs: BrowserTabState[];
  workspaceBookmarks: Record<string, WorkspaceBookmarkEntry[]>;
  tabFolders: TabFolderState[];
  persistedMap: Record<string, string>;
}): Record<string, string> {
  const tabsById = new Map(input.tabs.map((tab) => [tab.id, tab]));
  const result: Record<string, string> = {};
  for (const entries of Object.values(input.workspaceBookmarks)) {
    for (const entry of entries) {
      if (entry.url && !result[entry.tabId]) {
        result[entry.tabId] = entry.url;
      }
    }
  }
  for (const folder of input.tabFolders) {
    for (const item of folder.tabs ?? []) {
      if (result[item.tabId]) {
        continue;
      }
      const url = tabsById.get(item.tabId)?.url;
      if (url) {
        result[item.tabId] = url;
      }
    }
  }
  for (const [tabId, url] of Object.entries(input.persistedMap)) {
    if (!result[tabId]) {
      result[tabId] = url;
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────
// 输入读取：composite 直接读原始值，不经过登记表的 read 校验器，
// 因此必须自己承担"这一读要不要贡献补丁"的判断。但"预期形状"不自己定义 ——
// 一律复用登记表的逐项校验器（isBrowserTab / isBookmarkTabItem / isTabFolder）
// 与其读取器，保证同一个键不会出现两份宽严不一的形状判定。
//
// 语义：键缺失（undefined）≡ 空值（与 brief 的 `?? []` / `?? {}` 一致，
// 归一化器可以在只有部分键可用的会话里照常工作）；键存在但形状不合法 ⇒
// 该输入判为损坏（undefined），整个归一化器不贡献补丁，保留登记表简单条目
// 读出的值/fallback。刻意不做"逐项剔除畸形元素后继续" —— 那会在登记表判定
// 整值损坏、已回退 fallback 之后，又把一个被删减过的数组写回 store，
// 使两处对同一个键的判定互相矛盾。
// ─────────────────────────────────────────────────────────────

/** 缺失 → []；否则按登记表的数组读取器（任一项不合法 ⇒ 整值拒绝） */
function readArrayInput<T>(
  isItem: (item: Record<string, unknown>) => boolean,
  raw: unknown,
): T[] | undefined {
  return raw === undefined ? [] : readObjectArray<T>(isItem)(raw);
}

/** 缺失 → {}；否则按登记表的两层数组读取器（任一项不合法 ⇒ 整值拒绝） */
function readArrayRecordInput<T>(
  isItem: (item: Record<string, unknown>) => boolean,
  raw: unknown,
): Record<string, T[]> | undefined {
  return raw === undefined ? {} : readObjectArrayRecord<T>(isItem)(raw);
}

/** 缺失 → {}；否则按登记表的字符串映射读取器（任一值非字符串 ⇒ 整值拒绝） */
function readStringMapInput(raw: unknown): Record<string, string> | undefined {
  return raw === undefined ? {} : readStringRecord(raw);
}

export const compositeHydrators: CompositeHydrator[] = [
  {
    name: 'browserTabs',
    build: (read) => {
      const persistedTabs = readArrayInput<BrowserTabState>(isBrowserTab, read('adl:browser.tabs'));
      if (persistedTabs === undefined || persistedTabs.length === 0) {
        return {};
      }
      const tabs = markResolvedTitles(persistedTabs);
      const persistedActiveTabId = readString(read('adl:browser.activeTabId'));
      const activeTabId =
        persistedActiveTabId && tabs.some((tab) => tab.id === persistedActiveTabId)
          ? persistedActiveTabId
          : (tabs[tabs.length - 1]?.id ?? '');
      return {
        browserTabs: tabs,
        browserTabsById: Object.fromEntries(tabs.map((tab) => [tab.id, tab])),
        browserActiveTabId: activeTabId,
      };
    },
  },
  {
    name: 'browserTabIdUrlMap',
    build: (read) => {
      const tabs = readArrayInput<BrowserTabState>(isBrowserTab, read('adl:browser.tabs'));
      const workspaceBookmarks = readArrayRecordInput<WorkspaceBookmarkEntry>(
        isBookmarkTabItem,
        read('adl:browser.workspaceBookmarks'),
      );
      const tabFolders = readArrayInput<TabFolderState>(
        isTabFolder,
        read('adl:browser.tabFolders'),
      );
      const persistedMap = readStringMapInput(read('adl:browser.tabIdUrlMap'));
      if (
        tabs === undefined ||
        workspaceBookmarks === undefined ||
        tabFolders === undefined ||
        persistedMap === undefined
      ) {
        return {};
      }
      return {
        browserBookmarkTabIdUrlMap: buildBrowserTabUrlMap({
          tabs,
          workspaceBookmarks,
          tabFolders,
          persistedMap,
        }),
      };
    },
  },
];
