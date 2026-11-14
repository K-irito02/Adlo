import { useCallback } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { bookmarkUrlKey } from '@utils/browserDisplayUtils';
import { removeSiteMetaIfUnreferenced } from './siteMetaCleanup';
import { useOpenInCenterAction } from './useOpenInCenterAction';
import {
  findFolderByIdLocal,
  collectAllDescendantTabIdsLocal,
  collectAllDescendantTabUrlsLocal,
} from './browserTreeUtils';

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
  const { openUrlInCenter } = useOpenInCenterAction();
  const {
    browserDeleteAllBookmarksInNode,
    browserDeleteOwnBookmarksInNode,
    browserDeleteBookmarkFolder,
    browserOpenTab,
    browserRemoveOrphanedBookmarks,
  } = useAppStore(
    useShallow((state) => ({
      browserDeleteAllBookmarksInNode: state.browserDeleteAllBookmarksInNode,
      browserDeleteOwnBookmarksInNode: state.browserDeleteOwnBookmarksInNode,
      browserDeleteBookmarkFolder: state.browserDeleteBookmarkFolder,
      browserOpenTab: state.browserOpenTab,
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
              entries?: { id: string }[];
            }[],
            folderId,
          );
          tabIds.push(...descendantTabIds);
          const map = collectFolderTabSnapshotUrls(
            state.browserBookmarkFolders as {
              id: string;
              parentId?: string;
              entries?: { id: string; url: string }[];
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
              entries?: { id: string }[];
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
              entries?: { id: string }[];
            }[],
            folderId,
          );
          folderTabIds.push(...descendantTabs);
        }
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

  /** 收集目录（含嵌套）/工作区（含根目录）/历史日要批量打开的 URL（新标签与中心共用）。 */
  const collectNodeOpenTargets = useCallback(
    (nodePath: string): { url: string; title?: string; workspaceId?: string }[] => {
      const state = useAppStore.getState();
      const targets: { url: string; title?: string; workspaceId?: string }[] = [];
      const collectFolderTargets = (folderId: string, workspaceId?: string) => {
        const folder = state.browserBookmarkFolders.find((f) => f.id === folderId);
        (folder?.entries ?? []).forEach((entry) => {
          if (entry.url) {
            targets.push({
              url: entry.url,
              title: entry.title,
              ...(workspaceId ? { workspaceId } : {}),
            });
          }
        });
        state.browserBookmarkFolders
          .filter((f) => f.parentId === folderId)
          .forEach((child) => collectFolderTargets(child.id, workspaceId));
      };
      if (nodePath.startsWith('workspace:')) {
        const wsId = nodePath.slice('workspace:'.length);
        state.browserTabs
          .filter((t) => t.workspaceId === wsId)
          .forEach((tab) => targets.push({ url: tab.url, title: tab.title, workspaceId: wsId }));
        // 工作区根书签
        (state.browserWorkspaceBookmarks[wsId] ?? []).forEach((entry) => {
          if (entry.url) {
            targets.push({ url: entry.url, title: entry.title, workspaceId: wsId });
          }
        });
        // 工作区根目录及其嵌套目录内的书签
        state.browserBookmarkFolders
          .filter((f) => f.parentType === 'workspace' && f.parentId === wsId)
          .forEach((folder) => collectFolderTargets(folder.id, wsId));
      } else if (nodePath.startsWith('folder:')) {
        collectFolderTargets(nodePath.slice('folder:'.length));
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
          .forEach((h) => targets.push({ url: h.url, title: h.title }));
      }
      // 活标签与其书签快照、同目录重复条目都按 URL 身份去重，避免一次打开多份。
      const seen = new Set<string>();
      return targets.filter((target) => {
        if (!target.url) {
          return false;
        }
        const key = bookmarkUrlKey(target.url);
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
    },
    [],
  );

  const handleOpenAllInNewTabs = useCallback(
    (_categoryType: string, nodePath: string) => {
      for (const target of collectNodeOpenTargets(nodePath)) {
        browserOpenTab(target.url, target.title, target.workspaceId);
      }
    },
    [browserOpenTab, collectNodeOpenTargets],
  );

  /** 「全部在中心打开」：每条 URL 新建一个中心标签。 */
  const handleOpenAllInCenter = useCallback(
    (_categoryType: string, nodePath: string) => {
      for (const target of collectNodeOpenTargets(nodePath)) {
        openUrlInCenter(target.url, target.title, target.workspaceId);
      }
    },
    [collectNodeOpenTargets, openUrlInCenter],
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
                entries?: { id: string }[];
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
              entries?: { id: string; url: string }[];
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
    [browserDeleteBookmarkFolder, browserDeleteAllBookmarksInNode, browserRemoveOrphanedBookmarks],
  );

  return {
    handleDeleteAllChildTabs,
    handleDeleteOwnChildTabs,
    handleOpenAllInNewTabs,
    handleOpenAllInCenter,
    handleDeleteDirectory,
  };
}
