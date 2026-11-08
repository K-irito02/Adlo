import type { BookmarkFolder } from '@stores/slices/browserSlice';
import type { RecentWorkspaceEntry } from '@shared/ipc';
import { buildFolderPathLabel } from '@stores/slices/browserFoldersUtils';
import type { BrowserTreeNode } from './types';

export function buildBrowserNodeTitleMap(
  rootNodes: BrowserTreeNode[],
  tabFolders: BookmarkFolder[],
  workspaces: RecentWorkspaceEntry[],
  baseParentPath = '',
): Map<string, string> {
  const map = new Map<string, string>();
  const stack: { node: BrowserTreeNode; parentPath: string }[] = rootNodes.map((n) => ({
    node: n,
    parentPath: baseParentPath,
  }));
  while (stack.length > 0) {
    const { node, parentPath } = stack.pop()!;
    if (node.kind === 'directory') {
      const folderLabel =
        node.nodeType === 'folder' && node.folderId
          ? buildFolderPathLabel(node.folderId, tabFolders, workspaces)
          : '';
      map.set(node.path, folderLabel || node.name);
      for (const child of node.children) {
        stack.push({ node: child, parentPath: folderLabel });
      }
    } else if (node.kind === 'file') {
      if (node.nodeType === 'history') {
        map.set(node.path, node.name);
      } else if (parentPath) {
        map.set(node.path, `${parentPath}/${node.name}`);
      } else {
        map.set(node.path, node.name);
      }
    } else {
      map.set(node.path, node.name);
    }
  }
  return map;
}
