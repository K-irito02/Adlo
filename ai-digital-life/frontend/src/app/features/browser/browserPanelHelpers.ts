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