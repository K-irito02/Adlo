/**
 * Browser Folders 切片辅助函数与常量
 * 从 browserFoldersSlice.ts 提取的纯函数（无 store 访问）与 storage key 常量
 */
import type { BrowserTabState } from './browserSliceShared';
import {
  BROWSER_TAB_FOLDERS_KEY,
  BROWSER_TREE_EXPANDED_KEY,
  BROWSER_WORKSPACE_EXPANDED_KEY,
  BROWSER_TABS_KEY,
  BROWSER_ACTIVE_TAB_KEY,
  BROWSER_HISTORY_KEY,
  BROWSER_WORKSPACE_BOOKMARKS_KEY,
} from './browserSliceShared';
import type { TabFolderState } from './browserFoldersTypes';

export {
  BROWSER_TAB_FOLDERS_KEY,
  BROWSER_TREE_EXPANDED_KEY,
  BROWSER_WORKSPACE_EXPANDED_KEY,
  BROWSER_TABS_KEY,
  BROWSER_ACTIVE_TAB_KEY,
  BROWSER_HISTORY_KEY,
  BROWSER_WORKSPACE_BOOKMARKS_KEY,
};

// Public storage key aliases (preserved for backwards compatibility)
export const BROWSER_TAB_FOLDERS_STORAGE_KEY = BROWSER_TAB_FOLDERS_KEY;
export const BROWSER_TREE_EXPANDED_STORAGE_KEY = BROWSER_TREE_EXPANDED_KEY;
export const BROWSER_WORKSPACE_EXPANDED_STORAGE_KEY = BROWSER_WORKSPACE_EXPANDED_KEY;

export function findFolderById(folders: TabFolderState[], folderId: string): TabFolderState | null {
  return folders.find((folder) => folder.id === folderId) || null;
}

export function collectAllDescendantFolderIds(
  folders: TabFolderState[],
  parentId: string
): string[] {
  const result: string[] = [];
  const directChildren = folders.filter((f) => f.parentId === parentId);
  for (const child of directChildren) {
    result.push(child.id);
    result.push(...collectAllDescendantFolderIds(folders, child.id));
  }
  return result;
}

export function collectAllDescendantTabIds(folders: TabFolderState[], parentId: string): string[] {
  const result: string[] = [];
  const directChildren = folders.filter((f) => f.parentId === parentId);
  for (const child of directChildren) {
    if (child.tabs) {
      result.push(...child.tabs.map((item) => item.tabId));
    }
    result.push(...collectAllDescendantTabIds(folders, child.id));
  }
  return result;
}

export function collectAllFolderTabIds(folders: TabFolderState[], wsId: string): string[] {
  const rootFolders = folders.filter((f) => f.parentType === 'workspace' && f.parentId === wsId);
  const result: string[] = [];
  for (const rootFolder of rootFolders) {
    if (rootFolder.tabs) {
      result.push(...rootFolder.tabs.map((item) => item.tabId));
    }
    result.push(...collectAllDescendantTabIds(folders, rootFolder.id));
  }
  return result;
}

export function buildTabsById(tabs: BrowserTabState[]): Record<string, BrowserTabState> {
  const result: Record<string, BrowserTabState> = {};
  for (const tab of tabs) {
    result[tab.id] = tab;
  }
  return result;
}
