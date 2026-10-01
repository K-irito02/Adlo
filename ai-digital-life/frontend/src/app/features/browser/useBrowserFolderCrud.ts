import { useCallback } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { removeSiteMetaIfUnreferenced } from './siteMetaCleanup';
import {
  findFolderByIdLocal,
  collectAllDescendantTabIdsLocal,
  collectAllDescendantTabUrlsLocal,
} from './browserTreeUtils';

/** 该 tabId 对应的存活标签是否为中心标签（中心标签不受面板树删除影响）。 */
function isCenterTabId(
  tabs: { id: string; location?: 'panel' | 'center' }[],
  tabId: string,
): boolean {
  return tabs.find((t) => t.id === tabId)?.location === 'center';
}

function collectFolderTabSnapshotUrls(
  folders: { id: string; parentId?: string; tabs?: { tabId: string; url: string }[] }[],
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
    if (folder?.tabs) {
      for (const item of folder.tabs) {
        if (!map.has(item.tabId)) {
          map.set(item.tabId, item.url);
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
    browserDeleteAllTabsInNode,
    browserDeleteOwnTabsInNode,
    browserDeleteTabFolder,
    browserOpenTab,
    browserRemoveTabBookmarks,
    browserRemoveOrphanedBookmarks,
  } = useAppStore(
    useShallow((state) => ({
      browserDeleteAllTabsInNode: state.browserDeleteAllTabsInNode,
      browserDeleteOwnTabsInNode: state.browserDeleteOwnTabsInNode,
      browserDeleteTabFolder: state.browserDeleteTabFolder,
      browserOpenTab: state.browserOpenTab,
      browserRemoveTabBookmarks: state.browserRemoveTabBookmarks,
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
        const rootFolderIds = state.browserTabFolders
          .filter(
            (f) =>
              (f as { parentType?: string }).parentType === 'workspace' &&
              (f as { parentId?: string }).parentId === wsId,
          )
          .map((f) => f.id);
        for (const folderId of rootFolderIds) {
          const descendantTabIds = collectAllDescendantTabIdsLocal(
            state.browserTabFolders as {
              id: string;
              parentId?: string;
              tabs?: { tabId: string }[];
            }[],
            folderId,
          );
          tabIds.push(...descendantTabIds);
          const map = collectFolderTabSnapshotUrls(
            state.browserTabFolders as {
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
          const folderEntry = state.browserTabFolders.find((f) => f.id === fId);
          if (folderEntry?.tabs) {
            for (const item of folderEntry.tabs as { tabId: string; url: string }[]) {
              if (item.url && !urls.includes(item.url)) {
                urls.push(item.url);
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
          state.browserTabFolders as {
            id: string;
            tabs?: { tabId: string }[];
            children?: unknown[];
          }[],
          folderId,
        );
        if (folder) {
          tabIds = collectAllDescendantTabIdsLocal(
            state.browserTabFolders as {
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
            state.browserTabFolders as {
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
          state.browserTabFolders as {
            id: string;
            parentId?: string;
            tabs?: { tabId: string; url: string }[];
          }[],
          fId,
        );
        allTabUrls.push(...folderEntries);
      }
      if (!nodePath.startsWith('folder:')) {
        for (const tabId of tabIds) {
          const url =
            wsSnapshotUrls?.get(tabId) || state.browserTabs.find((t) => t.id === tabId)?.url || '';
          if (tabId && url) {
            allTabUrls.push({ tabId, url });
          }
        }
      }
      for (const { tabId, url } of allTabUrls) {
        if (tabId && url && !isCenterTabId(state.browserTabs, tabId)) {
          browserRemoveTabBookmarks(tabId, url);
        }
      }

      browserDeleteAllTabsInNode(nodePath);

      browserRemoveOrphanedBookmarks();

      for (const url of urls) {
        removeSiteMetaIfUnreferenced(url);
      }
    },
    [browserDeleteAllTabsInNode, browserRemoveTabBookmarks, browserRemoveOrphanedBookmarks],
  );

  const handleDeleteOwnChildTabs = useCallback(
    (_categoryType: string, nodePath: string) => {
      const state = useAppStore.getState();
      let tabIds: string[] = [];
      let urls: string[] = [];

      if (nodePath.startsWith('workspace:')) {
        const wsId = nodePath.slice('workspace:'.length);
        const allTabs = state.browserTabs.filter(
          (t) => t.workspaceId === wsId && t.location !== 'center',
        );
        const folderTabIds: string[] = [];
        const rootFolderIds = state.browserTabFolders
          .filter(
            (f) =>
              (f as { parentType?: string }).parentType === 'workspace' &&
              (f as { parentId?: string }).parentId === wsId,
          )
          .map((f) => f.id);
        for (const folderId of rootFolderIds) {
          const descendantTabs = collectAllDescendantTabIdsLocal(
            state.browserTabFolders as {
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
          state.browserTabFolders as {
            id: string;
            tabs?: { tabId: string }[];
            children?: unknown[];
          }[],
          folderId,
        );
        if (folder) {
          tabIds = [...(folder.tabs ?? []).map((item) => item.tabId)];
          urls = state.browserTabs
            .filter((t) => tabIds.includes(t.id))
            .map((t) => t.url)
            .filter((u): u is string => !!u);
          const folderSnapshotUrls = collectFolderTabSnapshotUrls(
            state.browserTabFolders as {
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

      if (nodePath.startsWith('folder:')) {
        const folderId = nodePath.slice('folder:'.length);
        const folder = state.browserTabFolders.find((f) => f.id === folderId);
        if (folder?.tabs) {
          for (const item of folder.tabs) {
            if (item.tabId && item.url && !isCenterTabId(state.browserTabs, item.tabId)) {
              browserRemoveTabBookmarks(item.tabId, item.url);
            }
          }
        }
      } else {
        for (const tabId of tabIds) {
          const url = state.browserTabs.find((t) => t.id === tabId)?.url || '';
          if (tabId && url && !isCenterTabId(state.browserTabs, tabId)) {
            browserRemoveTabBookmarks(tabId, url);
          }
        }
      }

      browserDeleteOwnTabsInNode(nodePath);

      browserRemoveOrphanedBookmarks();

      for (const url of urls) {
        removeSiteMetaIfUnreferenced(url);
      }
    },
    [browserDeleteOwnTabsInNode, browserRemoveTabBookmarks, browserRemoveOrphanedBookmarks],
  );

  const handleOpenAllInNewTabs = useCallback(
    (_categoryType: string, nodePath: string) => {
      const state = useAppStore.getState();
      if (nodePath.startsWith('workspace:')) {
        const wsId = nodePath.slice('workspace:'.length);
        const tabs = state.browserTabs.filter((t) => t.workspaceId === wsId);
        tabs.forEach((tab) => browserOpenTab(tab.url, tab.title, tab.workspaceId));
      } else if (nodePath.startsWith('folder:')) {
        const folderId = nodePath.slice('folder:'.length);
        const folder = findFolderByIdLocal(
          state.browserTabFolders as {
            id: string;
            tabs?: { tabId: string }[];
            children?: unknown[];
          }[],
          folderId,
        );
        if (folder?.tabs) {
          folder.tabs.forEach((item) => {
            const tab = state.browserTabs.find((t) => t.id === item.tabId);
            if (tab) {
              browserOpenTab(tab.url, tab.title, tab.workspaceId);
            }
          });
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
        browserDeleteAllTabsInNode(folderId);
        for (const entry of entries) {
          removeSiteMetaIfUnreferenced(entry.url);
        }
      } else {
        const actualId = folderId.startsWith('folder:')
          ? folderId.slice('folder:'.length)
          : folderId;
        const state = useAppStore.getState();
        const folder = findFolderByIdLocal(
          state.browserTabFolders as {
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
              state.browserTabFolders as {
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
            state.browserTabFolders as {
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
            const f = state.browserTabFolders.find((f) => f.id === fId);
            if (f?.tabs) {
              for (const item of f.tabs) {
                if (item.url) {
                  allTabUrls.push({ tabId: item.tabId, url: item.url });
                }
              }
            }
            for (const child of state.browserTabFolders.filter((f) => f.parentId === fId)) {
              collectFolderTabEntries(child.id);
            }
          };
          collectFolderTabEntries(actualId);
          for (const { tabId, url } of allTabUrls) {
            if (tabId && url && !isCenterTabId(state.browserTabs, tabId)) {
              browserRemoveTabBookmarks(tabId, url);
            }
          }
        }
        browserDeleteTabFolder(actualId);
        browserRemoveOrphanedBookmarks();
        for (const url of folderTabUrls) {
          removeSiteMetaIfUnreferenced(url);
        }
      }
    },
    [
      browserDeleteTabFolder,
      browserDeleteAllTabsInNode,
      browserRemoveTabBookmarks,
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
