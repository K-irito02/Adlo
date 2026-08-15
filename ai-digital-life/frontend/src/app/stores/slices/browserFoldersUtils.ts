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
import type { RecentWorkspaceEntry } from '@shared/ipc';

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
  parentId: string,
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

const MAX_PATH_STEPS = 20;

export function buildWorkspacePathLabel(wsId: string, workspaces: RecentWorkspaceEntry[]): string {
  const ws = workspaces.find((w) => w.id === wsId);
  if (!ws) {
    return '';
  }
  const label = (ws.name?.trim() || ws.path?.trim() || '').trim();
  return label.replace(/\\/g, '/');
}

export function buildFolderPathLabel(
  folderId: string,
  folders: TabFolderState[],
  workspaces: RecentWorkspaceEntry[],
): string {
  const parts: string[] = [];
  let currentId = folderId;
  let steps = 0;
  const visited = new Set<string>();
  while (currentId && steps < MAX_PATH_STEPS && !visited.has(currentId)) {
    const folder = findFolderById(folders, currentId);
    if (!folder) {
      break;
    }
    visited.add(currentId);
    parts.unshift(folder.name?.trim() || '');
    if (folder.parentType === 'workspace' && folder.parentId) {
      const wsLabel = buildWorkspacePathLabel(folder.parentId, workspaces);
      if (wsLabel) {
        parts.unshift(wsLabel);
      }
      break;
    }
    currentId = folder.parentId ?? '';
    steps += 1;
  }
  return parts.filter(Boolean).join('/');
}
