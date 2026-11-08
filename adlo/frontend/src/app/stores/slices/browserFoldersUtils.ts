/**
 * Browser Folders 切片辅助函数与常量
 * 从 browserFoldersSlice.ts 提取的纯函数（无 store 访问）与 storage key 常量
 */
import type { BrowserTabState } from './browserSliceShared';
import type { BookmarkFolder } from './browserFoldersTypes';
import type { RecentWorkspaceEntry } from '@shared/ipc';

// 浏览器持久化键的遗留常量与 STORAGE_KEY 别名均已删除 —— 其单一事实来源是
// persisted/registry.ts 的 `adl:browser.*` 登记键。

export function findFolderById(folders: BookmarkFolder[], folderId: string): BookmarkFolder | null {
  return folders.find((folder) => folder.id === folderId) || null;
}

export function collectAllDescendantFolderIds(
  folders: BookmarkFolder[],
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

/** 收集某个文件夹的直接子书签 id（不含更深层目录）。 */
export function collectDirectEntryIds(folders: BookmarkFolder[], folderId: string): string[] {
  const folder = findFolderById(folders, folderId);
  return (folder?.entries ?? []).map((entry) => entry.id);
}

/** 收集某个文件夹下全部后代文件夹里书签的 id。 */
export function collectDescendantEntryIds(folders: BookmarkFolder[], parentId: string): string[] {
  const result: string[] = [];
  const directChildren = folders.filter((f) => f.parentId === parentId);
  for (const child of directChildren) {
    if (child.entries) {
      result.push(...child.entries.map((entry) => entry.id));
    }
    result.push(...collectDescendantEntryIds(folders, child.id));
  }
  return result;
}

/** 收集某个工作区名下全部目录里书签的 id。 */
export function collectWorkspaceFolderEntryIds(folders: BookmarkFolder[], wsId: string): string[] {
  const rootFolders = folders.filter((f) => f.parentType === 'workspace' && f.parentId === wsId);
  const result: string[] = [];
  for (const rootFolder of rootFolders) {
    if (rootFolder.entries) {
      result.push(...rootFolder.entries.map((entry) => entry.id));
    }
    result.push(...collectDescendantEntryIds(folders, rootFolder.id));
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
  folders: BookmarkFolder[],
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
