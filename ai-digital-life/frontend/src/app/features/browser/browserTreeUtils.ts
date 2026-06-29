export function findFolderByIdLocal(
  folders: Array<{ id: string; tabs?: Array<{ tabId: string }>; children?: unknown[] }>,
  folderId: string
): { id: string; tabs?: Array<{ tabId: string }> } | null {
  for (const folder of folders) {
    if (folder.id === folderId) {
      return folder as { id: string; tabs?: Array<{ tabId: string }> };
    }
    if (Array.isArray(folder.children)) {
      const found = findFolderByIdLocal(
        folder.children as Array<{ id: string; children?: unknown[] }>,
        folderId
      );
      if (found) {
        return found;
      }
    }
  }
  return null;
}

export function collectAllDescendantTabIdsLocal(
  folders: Array<{ id: string; tabs?: Array<{ tabId: string }>; children?: unknown[] }>,
  parentId: string
): string[] {
  const result: string[] = [];
  const directChildren = folders.filter((f) => (f as { parentId?: string }).parentId === parentId);
  for (const child of directChildren) {
    if (child.tabs) {
      result.push(...child.tabs.map((item) => item.tabId));
    }
    result.push(...collectAllDescendantTabIdsLocal(folders, child.id));
  }
  return result;
}
