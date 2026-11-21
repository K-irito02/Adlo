import { useCallback, useMemo } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';

export function useBrowserFolderReorder() {
  const {
    recentWorkspaces,
    browserBookmarkFolders,
    browserTabTreeExpanded,
    browserHistory,
    browserToggleTabTreePath,
    browserExpandAllTreePaths,
    browserCollapseAllTreePaths,
  } = useAppStore(
    useShallow((state) => ({
      recentWorkspaces: state.recentWorkspaces,
      browserBookmarkFolders: state.browserBookmarkFolders,
      browserTabTreeExpanded: state.browserTabTreeExpanded,
      browserHistory: state.browserHistory,
      browserToggleTabTreePath: state.browserToggleTabTreePath,
      browserExpandAllTreePaths: state.browserExpandAllTreePaths,
      browserCollapseAllTreePaths: state.browserCollapseAllTreePaths,
    })),
  );

  const allTreeExpanded = useMemo(() => {
    const visible = recentWorkspaces.filter((w) => !w.removedFromSidebar && w.available);
    const wsPaths = visible.map((w) => `workspace:${w.id}`);
    const folderPaths = browserBookmarkFolders
      .filter((f) => !f.parentId)
      .map((f) => `folder:${f.id}`);
    const allEntryPaths = [...wsPaths, ...folderPaths];
    // 非空历史按持久化折叠态参与「全部展开/折叠」判定；空历史被强制展开
    // （显示「暂无历史记录」），直接视为已展开，不参与判定。
    if (browserHistory.length > 0) {
      allEntryPaths.push('history:root');
    }
    if (allEntryPaths.length === 0) {
      return false;
    }
    return allEntryPaths.every((p) => browserTabTreeExpanded[p] ?? false);
  }, [recentWorkspaces, browserBookmarkFolders, browserHistory, browserTabTreeExpanded]);

  const handleToggleTreePath = useCallback(
    (path: string) => {
      browserToggleTabTreePath(path);
    },
    [browserToggleTabTreePath],
  );

  const handleExpandAllTree = useCallback(() => {
    const state = useAppStore.getState();
    const paths: string[] = [];
    const workspaces = state.recentWorkspaces.filter((w) => !w.removedFromSidebar && w.available);
    for (const ws of workspaces) {
      paths.push(`workspace:${ws.id}`);
    }
    for (const folder of state.browserBookmarkFolders) {
      paths.push(`folder:${folder.id}`);
    }
    // 空历史也常驻顶层（展开显示「暂无历史记录」）。
    paths.push('history:root');
    browserExpandAllTreePaths(paths);
  }, [browserExpandAllTreePaths]);

  const handleCollapseAllTree = useCallback(() => {
    browserCollapseAllTreePaths();
  }, [browserCollapseAllTreePaths]);

  return {
    browserBookmarkFolders,
    tabTreeExpanded: browserTabTreeExpanded,
    allTreeExpanded,
    handleToggleTreePath,
    handleExpandAllTree,
    handleCollapseAllTree,
  };
}
