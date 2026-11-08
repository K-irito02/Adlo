import { useCallback } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { removeSiteMetaIfUnreferenced } from './siteMetaCleanup';
import {
  findFolderByIdLocal,
  collectAllDescendantTabIdsLocal,
  collectAllDescendantTabUrlsLocal,
} from './browserTreeUtils';

/** 存活的中心标签 id 集合（一次建成，循环内 O(1) 判定，避免逐项 find 的 O(n²)）。 */
function buildCenterTabIdSet(tabs: { id: string; location?: 'panel' | 'center' }[]): Set<string> {
  const ids = new Set<string>();
  for (const t of tabs) {
    if (t.location === 'center') {
      ids.add(t.id);
    }
  }
  return ids;
}

function collectFolderTabSnapshotUrls(
  folders: { id: string; parentId?: string; entries?: { id: string; url: string }[] }[],
  rootFolderId: string,
): Map<string, string> {
  const map = new Map<string, string>();
  const childrenMap = new Map<string, typeof folders>();
  for (const f of folders) {
    if (f.parentId) {
      if (!childrenMap.has(f.parentId)) {
        childrenMap.set(f.parentId, []);
      }
      childrenMap.get(f.parentId)!.push(f);
    }
  }
  const visit = (fId: string) => {
    const folder = folders.find((f) => f.id === fId);
    if (folder?.entries) {
      for (const entry of folder.entries) {
        if (!map.has(entry.id)) {
          map.set(entry.id, entry.url);
        }
      }
    }
    const children = childrenMap.get(fId);
    if (children) {
      for (const child of children) {
        visit(child.id);
      }
    }
  };
  visit(rootFolderId);
  return map;
}

export function useBrowserFolderCrud() {
  const {
    browserDeleteAllBookmarksInNode,
    browserDeleteOwnBookmarksInNode,
    browserDeleteBookmarkFolder,
    browserOpenTab,
    browserRemoveBookmark,
    browserRemoveOrphanedBookmarks,
  } = useAppStore(
    useShallow((state) => ({
      browserDeleteAllBookmarksInNode: state.browserDeleteAllBookmarksInNode,
      browserDeleteOwnBookmarksInNode: state.browserDeleteOwnBookmarksInNode,
      browserDeleteBookmarkFolder: state.browserDeleteBookmarkFolder,
      browserOpenTab: state.browserOpenTab,
      browserRemoveBookmark: state.browserRemoveBookmark,
      browserRemoveOrphanedBookmarks: state.browserRemoveOrphanedBookmarks,
    })),
  );

  const handleDeleteAllChildTabs = useCallback(
    (_categoryType: string, nodePath: string) => {
      const state = useAppStore.getState();
      let tabIds: string[] = [];
      let urls: string[] = [];
      let wsSnapshotUrls: Map<string, string> | null = null;

      if (nodePath.startsWith('workspace:')) {
        const wsId = nodePath.slice('workspace:'.length);
        const tabs = state.browserTabs.filter(
          (t) => t.workspaceId === wsId && t.location !== 'center',
        );
        tabIds = tabs.map((t) => t.id);
        urls = tabs.map((t) => t.url).filter((u): u is string => !!u);
        const rootFolderIds = state.browserBookmarkFolders
          .filter(
            (f) =>
              (f as { parentType?: string }).parentType === 'workspace' &&
              (f as { parentId?: string }).parentId === wsId,
          )
          .map((f) => f.id);
        for (const folderId of rootFolderIds) {
          const descendantTabIds = collectAllDescendantTabIdsLocal(
            state.browserBookmarkFolders as {
              id: string;
              parentId?: string;
              tabs?: { tabId: string }[];
            }[],
            folderId,
          );
          tabIds.push(...descendantTabIds);
          const map = collectFolderTabSnapshotUrls(
            state.browserBookmarkFolders as {
              id: string;
              parentId?: string;
              tabs?: { tabId: string; url: string }[];
            }[],
            folderId,
          );
          for (const [k, v] of map) {
            if (!wsSnapshotUrls) {
              wsSnapshotUrls = new Map();
            }
            if (!wsSnapshotUrls.has(k)) {
              wsSnapshotUrls.set(k, v);
            }
            if (!urls.includes(v)) {
              urls.push(v);
            }
          }
        }
        for (const fId of rootFolderIds) {
          const folderEntry = state.browserBookmarkFolders.find((f) => f.id === fId);
          if (folderEntry?.entries) {
            for (const entry of folderEntry.entries) {
              if (entry.url && !urls.includes(entry.url)) {
                urls.push(entry.url);
              }
            }
          }
        }
        const wsBookmarks = state.browserWorkspaceBookmarks[wsId];
        if (wsBookmarks) {
          for (const entry of wsBookmarks) {
            if (entry.url && !urls.includes(entry.url)) {
              urls.push(entry.url);
            }
          }
        }
      } else if (nodePath.startsWith('folder:')) {
        const folderId = nodePath.slice('folder:'.length);
        const folder = findFolderByIdLocal(
          state.browserBookmarkFolders as {
            id: string;
            tabs?: { tabId: string }[];
            children?: unknown[];
          }[],
          folderId,
        );
        if (folder) {
          tabIds = collectAllDescendantTabIdsLocal(
            state.browserBookmarkFolders as {
              id: string;
              parentId?: string;
              tabs?: { tabId: string }[];
            }[],
            folderId,
          );
          urls = state.browserTabs
            .filter((t) => tabIds.includes(t.id))
            .map((t) => t.url)
            .filter((u): u is string => !!u);
          const folderSnapshotUrls = collectFolderTabSnapshotUrls(
            state.browserBookmarkFolders as {
              id: string;
              parentId?: string;
              tabs?: { tabId: string; url: string }[];
            }[],
            folderId,
          );
          for (const url of folderSnapshotUrls.values()) {
            if (!urls.includes(url)) {
              urls.push(url);
            }
          }
        }
      } else if (nodePath.startsWith('history:day:')) {
        const dayDate = nodePath.slice('history:day:'.length);
        const entries = state.browserHistory.filter((h) => {
          const d = new Date(h.visitedAt);
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const dy = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${dy}` === dayDate;
        });
        tabIds = entries.map((h) => h.id);
        urls = entries.map((h) => h.url).filter((u): u is string => !!u);
      }

      const allTabUrls: { tabId: string; url: string }[] = [];
      if (nodePath.startsWith('folder:')) {
        const fId = nodePath.slice('folder:'.length);
        const folderEntries = collectAllDescendantTabUrlsLocal(
          state.browserBookmarkFolders as {
            id: string;
            parentId?: string;
            tabs?: { tabId: string; url: string }[];
          }[],
          fId,
        );
        allTabUrls.push(...folderEntries);
      }
      browserDeleteAllBookmarksInNode(nodePath);

      browserRemoveOrphanedBookmarks();

      for (const url of urls) {
        removeSiteMetaIfUnreferenced(url);
      }
    },
    [browserDeleteAllBookmarksInNode, browserRemoveOrphanedBookmarks],
  );

  const handleDeleteOwnChildTabs = useCallback(
    (_categoryType: string, nodePath: string) => {
      const state = useAppStore.getState();
      const centerTabIds = buildCenterTabIdSet(state.browserTabs);
      let tabIds: string[] = [];
      let urls: string[] = [];

      if (nodePath.startsWith('workspace:')) {
        const wsId = nodePath.slice('workspace:'.length);
        const allTabs = state.browserTabs.filter(
          (t) => t.workspaceId === wsId && t.location !== 'center',
        );
        const folderTabIds: string[] = [];
        const rootFolderIds = state.browserBookmarkFolders
          .filter(
            (f) =>
              (f as { parentType?: string }).parentType === 'workspace' &&
              (f as { parentId?: string }).parentId === wsId,
          )
          .map((f) => f.id);
        for (const folderId of rootFolderIds) {
          const descendantTabs = collectAllDescendantTabIdsLocal(
            state.browserBookmarkFolders as {
              id: string;
              parentId?: string;
              tabs?: { tabId: string }[];
            }[],
            folderId,
          );
          folderTabIds.push(...descendantTabs);
        }
        tabIds = allTabs.filter((t) => !folderTabIds.includes(t.id)).map((t) => t.id);
        urls = allTabs
          .filter((t) => !folderTabIds.includes(t.id))
          .map((t) => t.url)
          .filter((u): u is string => !!u);
        const wsBookmarks = state.browserWorkspaceBookmarks[wsId];
        if (wsBookmarks) {
          for (const entry of wsBookmarks) {
            if (entry.url && !urls.includes(entry.url)) {
              urls.push(entry.url);
            }
          }
        }
      } else if (nodePath.startsWith('folder:')) {
        const folderId = nodePath.slice('folder:'.length);
        const folder = findFolderByIdLocal(
          state.browserBookmarkFolders as {
            id: string;
            tabs?: { tabId: string }[];
            children?: unknown[];
          }[],
          folderId,
        );
        if (folder) {
          tabIds = [];
          const folderSnapshotUrls = collectFolderTabSnapshotUrls(
            state.browserBookmarkFolders as {
              id: string;
              parentId?: string;
              entries?: { id: string; url: string }[];
            }[],
            folderId,
          );
          for (const url of folderSnapshotUrls.values()) {
            if (!urls.includes(url)) {
              urls.push(url);
            }
          }
        }
      } else if (nodePath.startsWith('history:day:')) {
        const dayDate = nodePath.slice('history:day:'.length);
        const entries = state.browserHistory.filter((h) => {
          const d = new Date(h.visitedAt);
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const dy = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${dy}` === dayDate;
        });
        tabIds = entries.map((h) => h.id);
        urls = entries.map((h) => h.url).filter((u): u is string => !!u);
      }

      browserDeleteOwnBookmarksInNode(nodePath);

      browserRemoveOrphanedBookmarks();

      for (const url of urls) {
        removeSiteMetaIfUnreferenced(url);
      }
    },
    [browserDeleteOwnBookmarksInNode, browserRemoveOrphanedBookmarks],
  );

  const handleOpenAllInNewTabs = useCallback(
    (_categoryType: string, nodePath: string) => {
      const state = useAppStore.getState();
      if (nodePath.startsWith('workspace:')) {
        const wsId = nodePath.slice('workspace:'.length);
        const tabs = state.browserTabs.filter((t) => t.workspaceId === wsId);
        tabs.forEach((tab) => browserOpenTab(tab.url, tab.title, tab.workspaceId));
        // 工作区目录下的书签也一并打开（不再依赖"必须有活标签页"）
        (state.browserWorkspaceBookmarks[wsId] ?? []).forEach((entry) => {
          if (entry.url) {
            browserOpenTab(entry.url, entry.title, wsId);
          }
        });
      } else if (nodePath.startsWith('folder:')) {
        const folderId = nodePath.slice('folder:'.length);
        const folder = findFolderByIdLocal(
          state.browserBookmarkFolders as {
            id: string;
            entries?: { id: string; url: string; title: string }[];
            children?: unknown[];
          }[],
          folderId,
        );
        const collectEntries = (targetId: string) => {
          const current = state.browserBookmarkFolders.find((f) => f.id === targetId);
          (current?.entries ?? []).forEach((entry) => {
            if (entry.url) {
              browserOpenTab(entry.url, entry.title);
            }
          });
          state.browserBookmarkFolders
            .filter((f) => f.parentId === targetId)
            .forEach((child) => collectEntries(child.id));
        };
        if (folder) {
          collectEntries(folderId);
        }
      } else if (nodePath.startsWith('history:day:')) {
        const dayDate = nodePath.slice('history:day:'.length);
        state.browserHistory
          .filter((h) => {
            const d = new Date(h.visitedAt);
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const dy = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${dy}` === dayDate;
          })
          .forEach((h) => browserOpenTab(h.url, h.title));
      }
    },
    [browserOpenTab],
  );

  const handleDeleteDirectory = useCallback(
    (folderId: string) => {
      if (folderId.startsWith('history:')) {
        const state = useAppStore.getState();
        const dayDate = folderId.slice('history:day:'.length);
        const entries = state.browserHistory.filter((h) => {
          const d = new Date(h.visitedAt);
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const dy = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${dy}` === dayDate;
        });
        browserDeleteAllBookmarksInNode(folderId);
        for (const entry of entries) {
          removeSiteMetaIfUnreferenced(entry.url);
        }
      } else {
        const actualId = folderId.startsWith('folder:')
          ? folderId.slice('folder:'.length)
          : folderId;
        const state = useAppStore.getState();
        const centerTabIds = buildCenterTabIdSet(state.browserTabs);
        const folder = findFolderByIdLocal(
          state.browserBookmarkFolders as {
            id: string;
            tabs?: { tabId: string }[];
            children?: unknown[];
          }[],
          actualId,
        );
        let folderTabUrls: string[] = [];
        if (folder) {
          const allTabIds = [
            ...collectAllDescendantTabIdsLocal(
              state.browserBookmarkFolders as {
                id: string;
                parentId?: string;
                tabs?: { tabId: string }[];
              }[],
              actualId,
            ),
          ];
          folderTabUrls = state.browserTabs
            .filter((t) => allTabIds.includes(t.id))
            .map((t) => t.url)
            .filter((u): u is string => !!u);
          const folderSnapshotUrls = collectFolderTabSnapshotUrls(
            state.browserBookmarkFolders as {
              id: string;
              parentId?: string;
              tabs?: { tabId: string; url: string }[];
            }[],
            actualId,
          );
          for (const url of folderSnapshotUrls.values()) {
            if (!folderTabUrls.includes(url)) {
              folderTabUrls.push(url);
            }
          }
          const allTabUrls: { tabId: string; url: string }[] = [];
          const collectFolderTabEntries = (fId: string) => {
            const f = state.browserBookmarkFolders.find((folder) => folder.id === fId);
            if (f?.entries) {
              for (const entry of f.entries) {
                if (entry.url) {
                  allTabUrls.push({ tabId: entry.id, url: entry.url });
                }
              }
            }
            for (const child of state.browserBookmarkFolders.filter((f) => f.parentId === fId)) {
              collectFolderTabEntries(child.id);
            }
          };
          collectFolderTabEntries(actualId);
          for (const { url } of allTabUrls) {
            if (url && !folderTabUrls.includes(url)) {
              folderTabUrls.push(url);
            }
          }
        }
        browserDeleteBookmarkFolder(actualId);
        browserRemoveOrphanedBookmarks();
        for (const url of folderTabUrls) {
          removeSiteMetaIfUnreferenced(url);
        }
      }
    },
    [
      browserDeleteBookmarkFolder,
      browserDeleteAllBookmarksInNode,
      browserRemoveBookmark,
      browserRemoveOrphanedBookmarks,
    ],
  );

  return {
    handleDeleteAllChildTabs,
    handleDeleteOwnChildTabs,
    handleOpenAllInNewTabs,
    handleDeleteDirectory,
  };
}
