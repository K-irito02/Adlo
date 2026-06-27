export function findFolderByIdLocal(
  folders: Array<{ id: string; tabs?: string[]; children?: unknown[] }>,
  folderId: string
): { id: string; tabs?: string[] } | null {
  for (const folder of folders) {
    if (folder.id === folderId) {
      return folder as { id: string; tabs?: string[] };
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
  folders: Array<{ id: string; tabs?: string[]; children?: unknown[] }>,
  parentId: string
): string[] {
  const result: string[] = [];
  const directChildren = folders.filter((f) => (f as { parentId?: string }).parentId === parentId);
  for (const child of directChildren) {
    if (child.tabs) {
      result.push(...child.tabs);
    }
    result.push(...collectAllDescendantTabIdsLocal(folders, child.id));
  }
  return result;
}
