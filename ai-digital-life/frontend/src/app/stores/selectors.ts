/**
 * Store Selectors - 从主 store 中提取特定领域的数据
 *
 * 每个选择器提供纯函数版本（get*）和 React Hook 版本（use*），
 * 对返回对象/数组的 Hook 使用 useShallow 避免不必要的重渲染。
 */

import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from './slicedStore';
import type { StoreState } from './StoreState';

// ============================================
// 工作区相关的选择器
// ============================================
export const workspaceSelectors = {
  getAppInfo: (state: StoreState) => state.appInfo,
  useAppInfo: () => useAppStore(useShallow((s) => s.appInfo)),

  getCurrentWorkspace: (state: StoreState) => state.appInfo?.currentWorkspace,
  useCurrentWorkspace: () => useAppStore(useShallow((s) => s.appInfo?.currentWorkspace)),

  getRecentWorkspaces: (state: StoreState) => state.recentWorkspaces,
  useRecentWorkspaces: () => useAppStore(useShallow((s) => s.recentWorkspaces)),

  getGitSnapshot: (state: StoreState) => state.gitSnapshot,
  useGitSnapshot: () => useAppStore(useShallow((s) => s.gitSnapshot)),

  getGitBranches: (state: StoreState) => state.gitBranches,
  useGitBranches: () => useAppStore(useShallow((s) => s.gitBranches)),

  getWorkspaceContextMode: (state: StoreState) => state.workspaceContextMode,
  useWorkspaceContextMode: () => useAppStore(useShallow((s) => s.workspaceContextMode)),

  getIndexingStatus: (state: StoreState) => state.indexingStatus,
  useIndexingStatus: () => useAppStore(useShallow((s) => s.indexingStatus)),

  getRepoMap: (state: StoreState) => state.repoMap,
  useRepoMap: () => useAppStore(useShallow((s) => s.repoMap)),

  hasCurrentWorkspace: (state: StoreState) => Boolean(state.appInfo?.currentWorkspace),
  useHasCurrentWorkspace: () => useAppStore((s) => Boolean(s.appInfo?.currentWorkspace)),

  getWorkspaceId: (state: StoreState) => state.appInfo?.currentWorkspace?.id,
  useWorkspaceId: () => useAppStore((s) => s.appInfo?.currentWorkspace?.id),
};

// ============================================
// 会话相关的选择器
// ============================================
export const sessionSelectors = {
  getSessions: (state: StoreState) => state.sessions,
  useSessions: () => useAppStore(useShallow((s) => s.sessions)),

  getActiveSessionId: (state: StoreState) => state.activeSessionId,
  useActiveSessionId: () => useAppStore((s) => s.activeSessionId),

  getActiveSession: (state: StoreState) => {
    const activeId = state.activeSessionId;
    if (!activeId) {
      return undefined;
    }
    return state.sessionDetails[activeId];
  },
  useActiveSession: () =>
    useAppStore(
      useShallow((s) => {
        if (!s.activeSessionId) {
          return undefined;
        }
        return s.sessionDetails[s.activeSessionId];
      })
    ),

  getSessionDetails: (state: StoreState) => state.sessionDetails,
  useSessionDetails: () => useAppStore(useShallow((s) => s.sessionDetails)),

  getSessionCount: (state: StoreState) => state.sessions.length,
  useSessionCount: () => useAppStore((s) => s.sessions.length),

  hasSessions: (state: StoreState) => state.sessions.length > 0,
  useHasSessions: () => useAppStore((s) => s.sessions.length > 0),
};

// ============================================
// 编辑器相关的选择器
// ============================================
export const editorSelectors = {
  getOpenTabs: (state: StoreState) => state.openTabs,
  useOpenTabs: () => useAppStore(useShallow((s) => s.openTabs)),

  getSelectedFilePath: (state: StoreState) => state.selectedFilePath,
  useSelectedFilePath: () => useAppStore((s) => s.selectedFilePath),

  getFileContent: (state: StoreState) => state.fileContent,
  useFileContent: () => useAppStore((s) => s.fileContent),

  getFileLastModifiedAt: (state: StoreState) => state.fileLastModifiedAt,
  useFileLastModifiedAt: () => useAppStore((s) => s.fileLastModifiedAt),

  getOutline: (state: StoreState) => state.outline,
  useOutline: () => useAppStore(useShallow((s) => s.outline)),

  getDirtyEditorPaths: (state: StoreState) => state.dirtyEditorPaths,
  useDirtyEditorPaths: () => useAppStore(useShallow((s) => s.dirtyEditorPaths)),

  getExternalFileChange: (state: StoreState) => state.externalFileChange,
  useExternalFileChange: () => useAppStore(useShallow((s) => s.externalFileChange)),

  isFileDirty: (relativePath: string) => (state: StoreState) =>
    state.dirtyEditorPaths.includes(relativePath),
  useIsFileDirty: (relativePath: string) =>
    useAppStore((s) => s.dirtyEditorPaths.includes(relativePath)),

  getOpenTabCount: (state: StoreState) => state.openTabs.length,
  useOpenTabCount: () => useAppStore((s) => s.openTabs.length),
};

// ============================================
// 补丁相关的选择器
// ============================================
export const patchSelectors = {
  getActivePatchSet: (state: StoreState) => state.activePatchSet,
  useActivePatchSet: () => useAppStore(useShallow((s) => s.activePatchSet)),

  getLatestPatchApplication: (state: StoreState) => state.latestPatchApplication,
  useLatestPatchApplication: () => useAppStore(useShallow((s) => s.latestPatchApplication)),

  getSelectedChangePreviewPath: (state: StoreState) => state.selectedChangePreviewPath,
  useSelectedChangePreviewPath: () => useAppStore((s) => s.selectedChangePreviewPath),

  getChangePreview: (state: StoreState) => state.changePreview,
  useChangePreview: () => useAppStore(useShallow((s) => s.changePreview)),

  isChangePreviewLoading: (state: StoreState) => state.changePreviewLoading,
  useIsChangePreviewLoading: () => useAppStore((s) => s.changePreviewLoading),

  hasActivePatchSet: (state: StoreState) => Boolean(state.activePatchSet),
  useHasActivePatchSet: () => useAppStore((s) => Boolean(s.activePatchSet)),
};

// ============================================
// 任务相关的选择器
// ============================================
export const taskSelectors = {
  getTaskCenter: (state: StoreState) => state.taskCenter,
  useTaskCenter: () => useAppStore(useShallow((s) => s.taskCenter)),

  getAuditEntries: (state: StoreState) => state.auditEntries,
  useAuditEntries: () => useAppStore(useShallow((s) => s.auditEntries)),

  hasTaskCenter: (state: StoreState) => Boolean(state.taskCenter),
  useHasTaskCenter: () => useAppStore((s) => Boolean(s.taskCenter)),
};

// ============================================
// 运行相关的选择器
// ============================================
export const runSelectors = {
  getActiveRun: (state: StoreState) => state.activeRun,
  useActiveRun: () => useAppStore(useShallow((s) => s.activeRun)),

  getStreamingAssistantText: (state: StoreState) => state.streamingAssistantText,
  useStreamingAssistantText: () => useAppStore((s) => s.streamingAssistantText),

  getStreamingActiveRunId: (state: StoreState) => state.streamingActiveRunId,
  useStreamingActiveRunId: () => useAppStore((s) => s.streamingActiveRunId),

  getRunActivityByRunId: (state: StoreState) => state.runActivityByRunId,
  useRunActivityByRunId: () => useAppStore(useShallow((s) => s.runActivityByRunId)),

  getRunUsageByRunId: (state: StoreState) => state.runUsageByRunId,
  useRunUsageByRunId: () => useAppStore(useShallow((s) => s.runUsageByRunId)),

  hasActiveRun: (state: StoreState) => Boolean(state.activeRun),
  useHasActiveRun: () => useAppStore((s) => Boolean(s.activeRun)),

  isStreaming: (state: StoreState) => Boolean(state.streamingActiveRunId),
  useIsStreaming: () => useAppStore((s) => Boolean(s.streamingActiveRunId)),
};

// ============================================
// 模型健康相关的选择器
// ============================================
export const modelSelectors = {
  getModelHealth: (state: StoreState) => state.modelHealth,
  useModelHealth: () => useAppStore(useShallow((s) => s.modelHealth)),

  hasModelHealth: (state: StoreState) => Boolean(state.modelHealth),
  useHasModelHealth: () => useAppStore((s) => Boolean(s.modelHealth)),
};

// ============================================
// 命令相关的选择器
// ============================================
export const commandSelectors = {
  getCommandHistory: (state: StoreState) => state.commandHistory,
  useCommandHistory: () => useAppStore(useShallow((s) => s.commandHistory)),

  getLatestCommandRun: (state: StoreState) => state.latestCommandRun,
  useLatestCommandRun: () => useAppStore(useShallow((s) => s.latestCommandRun)),

  hasCommandHistory: (state: StoreState) => state.commandHistory.length > 0,
  useHasCommandHistory: () => useAppStore((s) => s.commandHistory.length > 0),
};

// ============================================
// 搜索相关的选择器
// ============================================
export const searchSelectors = {
  getSearchQuery: (state: StoreState) => state.searchQuery,
  useSearchQuery: () => useAppStore((s) => s.searchQuery),

  getSearchResults: (state: StoreState) => state.searchResults,
  useSearchResults: () => useAppStore(useShallow((s) => s.searchResults)),

  hasSearchResults: (state: StoreState) => state.searchResults.length > 0,
  useHasSearchResults: () => useAppStore((s) => s.searchResults.length > 0),
};

// ============================================
// 终端相关的选择器
// ============================================
export const terminalSelectors = {
  getTerminalTabs: (state: StoreState) => state.terminalTabs,
  useTerminalTabs: () => useAppStore(useShallow((s) => s.terminalTabs)),

  getTerminalActiveTabId: (state: StoreState) => state.terminalActiveTabId,
  useTerminalActiveTabId: () => useAppStore((s) => s.terminalActiveTabId),

  getDefaultTerminalProfile: (state: StoreState) => state.defaultTerminalProfile,
  useDefaultTerminalProfile: () => useAppStore((s) => s.defaultTerminalProfile),

  getWorkspaceDefaultProfiles: (state: StoreState) => state.workspaceDefaultProfiles,
  useWorkspaceDefaultProfiles: () => useAppStore(useShallow((s) => s.workspaceDefaultProfiles)),

  getTerminalNavigatorWidth: (state: StoreState) => state.terminalNavigatorWidth,
  useTerminalNavigatorWidth: () => useAppStore((s) => s.terminalNavigatorWidth),

  getNavigatorCollapsedByTool: (state: StoreState) => state.navigatorCollapsedByTool,
  useNavigatorCollapsedByTool: () => useAppStore(useShallow((s) => s.navigatorCollapsedByTool)),

  getActiveTerminalTab: (state: StoreState) =>
    state.terminalActiveTabId ? state.terminalTabsById[state.terminalActiveTabId] : undefined,
  useActiveTerminalTab: () =>
    useAppStore(
      useShallow((s) =>
        s.terminalActiveTabId ? s.terminalTabsById[s.terminalActiveTabId] : undefined
      )
    ),

  hasTerminalTabs: (state: StoreState) => state.terminalTabs.length > 0,
  useHasTerminalTabs: () => useAppStore((s) => s.terminalTabs.length > 0),
};

// ============================================
// 组合选择器
// ============================================
export const combinedSelectors = {
  canOpenNewTab: (state: StoreState) => state.openTabs.length < 20,
  useCanOpenNewTab: () => useAppStore((s) => s.openTabs.length < 20),

  isWorkspaceReady: (state: StoreState) =>
    Boolean(state.appInfo?.currentWorkspace) && state.indexingStatus?.state !== 'indexing',
  useIsWorkspaceReady: () =>
    useAppStore(
      (s) => Boolean(s.appInfo?.currentWorkspace) && s.indexingStatus?.state !== 'indexing'
    ),

  getCurrentFileTab: (state: StoreState) => {
    if (!state.selectedFilePath) {
      return undefined;
    }
    return state.openTabs.find((tab) => tab.path === state.selectedFilePath);
  },
  useCurrentFileTab: () =>
    useAppStore(
      useShallow((s) => {
        if (!s.selectedFilePath) {
          return undefined;
        }
        return s.openTabs.find((tab) => tab.path === s.selectedFilePath);
      })
    ),
};
