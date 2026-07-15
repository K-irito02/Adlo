import type { RecentWorkspaceEntry } from '@shared/ipc';
import type { TabFolderState } from '@stores/slices/browserSlice';
import type { FileTreeRenderableNode } from '@features/file-tree/fileTree.utils';

function buildFolderDirNode(
  folder: TabFolderState,
  allFolders: TabFolderState[]
): FileTreeRenderableNode {
  const childFolders = allFolders.filter(
    (f) => f.parentId === folder.id && (!f.parentType || f.parentType === 'folder')
  );
  return {
    path: `folder:${folder.id}`,
    name: folder.name,
    kind: 'directory',
    children: childFolders.map((child) => buildFolderDirNode(child, allFolders)),
  };
}

export function buildBookmarkDirectoryTree(
  workspaces: RecentWorkspaceEntry[],
  tabFolders: TabFolderState[]
): {
  workspaceNodes: FileTreeRenderableNode[];
  userFolderNodes: FileTreeRenderableNode[];
} {
  const workspaceNodes: FileTreeRenderableNode[] = workspaces.map((ws) => {
    const wsRootFolders = tabFolders.filter(
      (f) => f.parentType === 'workspace' && f.parentId === ws.id
    );
    return {
      path: `workspace:${ws.id}`,
      name: ws.name || ws.path,
      kind: 'directory',
      children: wsRootFolders.map((folder) => buildFolderDirNode(folder, tabFolders)),
    };
  });

  const userFolderNodes: FileTreeRenderableNode[] = tabFolders
    .filter((f) => !f.parentId)
    .map((folder) => buildFolderDirNode(folder, tabFolders));

  return { workspaceNodes, userFolderNodes };
}

export function resolveFolderWorkspaceId(
  folderId: string,
  folders: Array<{ id: string; parentId?: string; parentType?: 'workspace' | 'folder' }>
): string | undefined {
  const folder = folders.find((f) => f.id === folderId);
  if (!folder) {
    return undefined;
  }
  if (folder.parentType === 'workspace') {
    return folder.parentId;
  }
  if (folder.parentType === 'folder' && folder.parentId) {
    return resolveFolderWorkspaceId(folder.parentId, folders);
  }
  return undefined;
}

export function handleRenameFromContextMenu(
  browserTabs: Array<{ id: string; title: string }>,
  contextMenu: { tabId: string | null },
  handleDoubleClick: (tabId: string, title: string) => void
): () => void {
  return () => {
    if (contextMenu.tabId) {
      const tab = browserTabs.find((t) => t.id === contextMenu.tabId);
      if (tab) {
        handleDoubleClick(contextMenu.tabId, tab.title);
      }
    }
  };
}

export function handleDeleteFromContextMenu(
  contextMenu: { tabId: string | null },
  handleCloseTab: (tabId: string) => void
): () => void {
  return () => {
    if (contextMenu.tabId) {
      handleCloseTab(contextMenu.tabId);
    }
  };
}
