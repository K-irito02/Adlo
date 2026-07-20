export function findFolderByIdLocal(
  folders: { id: string; tabs?: { tabId: string }[]; children?: unknown[] }[],
  folderId: string,
): { id: string; tabs?: { tabId: string }[] } | null {
  for (const folder of folders) {
    if (folder.id === folderId) {
      return folder as { id: string; tabs?: { tabId: string }[] };
    }
    if (Array.isArray(folder.children)) {
      const found = findFolderByIdLocal(
        folder.children as { id: string; children?: unknown[] }[],
        folderId,
      );
      if (found) {
        return found;
      }
    }
  }
  return null;
}

export function collectAllDescendantTabIdsLocal(
  folders: { id: string; parentId?: string; tabs?: { tabId: string }[] }[],
  parentId: string,
): string[] {
  const childrenMap = new Map<string, typeof folders>();
  for (const f of folders) {
    if (f.parentId) {
      if (!childrenMap.has(f.parentId)) {
        childrenMap.set(f.parentId, []);
      }
      childrenMap.get(f.parentId)!.push(f);
    }
  }
  const result: string[] = [];
  const collect = (pid: string) => {
    const folder = folders.find((f) => f.id === pid);
    if (folder?.tabs) {
      result.push(...folder.tabs.map((item) => item.tabId));
    }
    const children = childrenMap.get(pid);
    if (!children) {
      return;
    }
    for (const child of children) {
      collect(child.id);
    }
  };
  collect(parentId);
  return result;
}

/** Collect ALL (tabId, url) pairs from the folder tree rooted at parentId — no dedup. */
export function collectAllDescendantTabUrlsLocal(
  folders: { id: string; parentId?: string; tabs?: { tabId: string; url: string }[] }[],
  parentId: string,
): { tabId: string; url: string }[] {
  const childrenMap = new Map<string, typeof folders>();
  for (const f of folders) {
    if (f.parentId) {
      if (!childrenMap.has(f.parentId)) {
        childrenMap.set(f.parentId, []);
      }
      childrenMap.get(f.parentId)!.push(f);
    }
  }
  const result: { tabId: string; url: string }[] = [];
  const collect = (pid: string) => {
    const folder = folders.find((f) => f.id === pid);
    if (folder?.tabs) {
      for (const item of folder.tabs) {
        if (item.tabId && item.url) {
          result.push({ tabId: item.tabId, url: item.url });
        }
      }
    }
    const children = childrenMap.get(pid);
    if (!children) {
      return;
    }
    for (const child of children) {
      collect(child.id);
    }
  };
  collect(parentId);
  return result;
}
