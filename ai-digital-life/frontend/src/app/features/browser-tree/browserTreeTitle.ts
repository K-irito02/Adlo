import type { TabFolderState } from '@stores/slices/browserSlice';
import type { RecentWorkspaceEntry } from '@shared/ipc';
import { buildFolderPathLabel } from '@stores/slices/browserFoldersUtils';
import type { BrowserTreeNode } from './types';

export function getBrowserNodeTitle(
  node: BrowserTreeNode,
  parentFolderId: string,
  tabFolders: TabFolderState[],
  workspaces: RecentWorkspaceEntry[],
): string {
  if (node.kind === 'directory' && node.nodeType === 'folder' && node.folderId) {
    return buildFolderPathLabel(node.folderId, tabFolders, workspaces);
  }
  if (node.kind === 'file' && node.nodeType === 'history') {
    return node.name;
  }
  // 书签/标签叶子：父级 folder 的路径作为锚点
  if (node.kind === 'file' && parentFolderId) {
    const parentPath = buildFolderPathLabel(parentFolderId, tabFolders, workspaces);
    if (parentPath) {
      return `${parentPath} / ${node.name}`;
    }
  }
  return node.name;
}
