import { isRealTitle } from '@utils/browserDisplayUtils';
import type { StoreState } from '../StoreState';
import type { BrowserTabState } from '../slices/browserSliceShared';
import type { WorkspaceBookmarkEntry } from '../slices/browserTypes';
import type { BookmarkTabItem, TabFolderState } from '../slices/browserFoldersSlice';

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
// 防御性读取：composite 直接读原始值，不经过登记表的 read 校验器，
// 因此任何"形状不对"的存储值都必须在进入归一化逻辑前被拦下 ——
// 坏数据绝不能让启动期水合抛错（规格 §3.3：水合绝不阻塞启动）。
//
// 语义：键缺失（undefined）≡ 空值（与 brief 的 `?? []` / `?? {}` 一致）；
// 键存在但形状不对 ⇒ 该归一化器整体不贡献补丁（返回 {}），保留登记表
// 简单条目读出的值/fallback。刻意不做"逐项剔除畸形元素后继续" —— 那会在
// 登记表判定整值损坏、已回退 fallback 之后，又把一个被删减过的数组写回 store，
// 使两处对同一个键的判定互相矛盾。
// ─────────────────────────────────────────────────────────────

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 缺失 → []；对象数组 → 原值；其余（含含非对象项）→ undefined（损坏） */
function asObjectArray<T>(raw: unknown): T[] | undefined {
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw) || !raw.every(isPlainObject)) {
    return undefined;
  }
  return raw as T[];
}

/** 缺失 → {}；其值为对象数组的两层表 → 原值；其余 → undefined（损坏） */
function asObjectArrayRecord<T>(raw: unknown): Record<string, T[]> | undefined {
  if (raw === undefined) {
    return {};
  }
  if (!isPlainObject(raw)) {
    return undefined;
  }
  const result: Record<string, T[]> = {};
  for (const [key, value] of Object.entries(raw)) {
    const items = asObjectArray<T>(value);
    if (items === undefined) {
      return undefined;
    }
    result[key] = items;
  }
  return result;
}

/** 缺失 → {}；字符串映射 → 原值；其余 → undefined（损坏） */
function asStringMap(raw: unknown): Record<string, string> | undefined {
  if (raw === undefined) {
    return {};
  }
  if (!isPlainObject(raw)) {
    return undefined;
  }
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'string') {
      return undefined;
    }
    result[key] = value;
  }
  return result;
}

/** 文件夹表：额外要求每项的 `tabs` 缺失或为对象数组（构建映射时会逐项迭代） */
function asTabFolders(raw: unknown): TabFolderState[] | undefined {
  const folders = asObjectArray<TabFolderState>(raw);
  if (folders === undefined) {
    return undefined;
  }
  for (const folder of folders) {
    const tabs = (folder as { tabs?: unknown }).tabs;
    if (tabs !== undefined && asObjectArray<BookmarkTabItem>(tabs) === undefined) {
      return undefined;
    }
  }
  return folders;
}

export const compositeHydrators: CompositeHydrator[] = [
  {
    name: 'browserTabs',
    build: (read) => {
      const persistedTabs = asObjectArray<BrowserTabState>(read('adl:browser.tabs'));
      if (persistedTabs === undefined || persistedTabs.length === 0) {
        return {};
      }
      const tabs = markResolvedTitles(persistedTabs);
      const rawActiveTabId = read('adl:browser.activeTabId');
      const persistedActiveTabId = typeof rawActiveTabId === 'string' ? rawActiveTabId : undefined;
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
      const tabs = asObjectArray<BrowserTabState>(read('adl:browser.tabs'));
      const workspaceBookmarks = asObjectArrayRecord<WorkspaceBookmarkEntry>(
        read('adl:browser.workspaceBookmarks'),
      );
      const tabFolders = asTabFolders(read('adl:browser.tabFolders'));
      const persistedMap = asStringMap(read('adl:browser.tabIdUrlMap'));
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
