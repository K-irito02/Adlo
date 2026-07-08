/**
 * UI 切片类型和常量
 * 从 uiSlice.ts 提取，供 uiSlice.ts 和消费者使用
 */
import type {
  ChatMode,
  ToolId,
  FilesNavigatorMode,
  ChangesNavigatorMode,
  ContextChip,
} from '../types';
import type { SettingsGroupId } from '@ai-digital-life/kernel';

// ════════════════════════════════════════════════════════
// LocalStorage 键名常量
// ════════════════════════════════════════════════════════
export const LEFT_COLLAPSED_KEY = 'adl-ui:left-collapsed';
export const RIGHT_COLLAPSED_KEY = 'adl-ui:right-collapsed';
export const RIGHT_PANEL_WIDTH_KEY = 'adl-ui:right-panel-width';
export const FILES_NAVIGATOR_WIDTH_KEY = 'adl-ui:files-navigator-width';
export const CHANGES_NAVIGATOR_WIDTH_KEY = 'adl-ui:changes-navigator-width';
export const BROWSER_NAVIGATOR_WIDTH_KEY = 'adl-ui:browser-navigator-width';
export const GITHUB_NAVIGATOR_WIDTH_KEY = 'adl-ui:github-navigator-width';
export const FILE_TREE_EXPANDED_KEY = 'adl-ui:file-tree-expanded';
export const CHANGES_TREE_EXPANDED_KEY = 'adl-ui:changes-tree-expanded';
export const FILES_NAVIGATOR_MODE_KEY = 'adl-ui:files-navigator-mode';
export const CHANGES_NAVIGATOR_MODE_KEY = 'adl-ui:changes-navigator-mode';
export const FILE_PREVIEW_MODE_KEY = 'adl-ui:file-preview-mode';
export const CHANGES_PREVIEW_ENABLED_KEY = 'adl-ui:changes-preview-enabled';
export const SESSION_TABS_EXPANDED_KEY = 'adl-ui:session-tabs-expanded';
export const ACTIVE_RIGHT_TOOL_KEY = 'adl-ui:active-right-tool';
export const SHOW_GIT_VISUALIZATION_KEY = 'adl-ui:show-git-visualization';

// ════════════════════════════════════════════════════════
// 面板宽度常量
// ════════════════════════════════════════════════════════
export const RIGHT_PANEL_WIDTH_MIN = 320;
export const RIGHT_PANEL_WIDTH_MAX = 4096;
export const DEFAULT_RIGHT_PANEL_WIDTH = 520;
export const FILES_NAVIGATOR_WIDTH_MIN = 180;
export const FILES_NAVIGATOR_WIDTH_MAX = 420;
export const DEFAULT_FILES_NAVIGATOR_WIDTH = 240;
export const CHANGES_NAVIGATOR_WIDTH_MIN = 180;
export const CHANGES_NAVIGATOR_WIDTH_MAX = 300;
export const DEFAULT_CHANGES_NAVIGATOR_WIDTH = 240;
export const BROWSER_NAVIGATOR_WIDTH_MIN = 180;
export const BROWSER_NAVIGATOR_WIDTH_MAX = 300;
export const DEFAULT_BROWSER_NAVIGATOR_WIDTH = 240;
export const GITHUB_NAVIGATOR_WIDTH_MIN = 180;
export const GITHUB_NAVIGATOR_WIDTH_MAX = 420;
export const DEFAULT_GITHUB_NAVIGATOR_WIDTH = 200;

// ════════════════════════════════════════════════════════
// 类型定义
// ════════════════════════════════════════════════════════
export type TreeExpansionState = Record<string, boolean>;
export type FileTreeExpansionState = Record<string, TreeExpansionState>;
export type FilePreviewModeState = Record<string, boolean>;

export interface UISlice {
  activeRightTool: ToolId;
  chatMode: ChatMode;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  rightPanelWidth: number;
  filesNavigatorWidth: number;
  changesNavigatorWidth: number;
  browserNavigatorWidth: number;
  gitHubNavigatorWidth: number;
  isFetching: Record<string, boolean>;
  expandedFileTreePaths: FileTreeExpansionState;
  expandedChangesTreePaths: TreeExpansionState;
  filesNavigatorMode: FilesNavigatorMode;
  changesNavigatorMode: ChangesNavigatorMode;
  filePreviewModeByPath: FilePreviewModeState;
  changesPreviewEnabled: boolean;
  showGitVisualization: boolean;
  expandedSessionWorkspaces: Record<string, boolean>;
  contextChips: ContextChip[];
  contextMenuOpen: boolean;
  fileMenuOpen: boolean;
  viewMenuOpen: boolean;
  helpMenuOpen: boolean;
  activeSettingsGroup: SettingsGroupId;
  settingsSearchQuery: string;
  navigatorCollapsedByTool: Record<ToolId, boolean>;

  setActiveRightTool: (tool: ToolId) => void;
  setChatMode: (mode: ChatMode) => void;
  setLeftCollapsed: (collapsed: boolean) => void;
  setRightCollapsed: (collapsed: boolean) => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  toggleBoth: () => void;
  setRightPanelWidth: (width: number) => void;
  setFilesNavigatorWidth: (width: number) => void;
  setChangesNavigatorWidth: (width: number) => void;
  setBrowserNavigatorWidth: (width: number) => void;
  setGitHubNavigatorWidth: (width: number) => void;
  setIsFetching: (key: string, value: boolean) => void;
  setError: (message?: string) => void;
  setFileTreePathExpanded: (workspaceId: string, path: string, expanded: boolean) => void;
  toggleFileTreePath: (workspaceId: string, path: string) => void;
  expandFileTreePathChain: (workspaceId: string, path: string) => void;
  collapseAllFileTreePaths: (workspaceId: string) => void;
  setFilesNavigatorMode: (mode: FilesNavigatorMode) => void;
  setFilePreviewModeForPath: (path: string, previewEnabled: boolean) => void;
  setChangesPreviewEnabled: (previewEnabled: boolean) => void;
  setShowGitVisualization: (show: boolean) => void;
  setChangesNavigatorMode: (mode: ChangesNavigatorMode) => void;
  setChangesTreePathExpanded: (path: string, expanded: boolean) => void;
  toggleChangesTreePath: (path: string) => void;
  expandChangesTreePathChain: (path: string) => void;
  collapseAllChangesTreePaths: () => void;
  toggleSessionWorkspace: (workspaceId: string) => void;
  addContextChip: (chip: ContextChip) => void;
  removeContextChip: (id: string) => void;
  clearContextChips: () => void;
  setContextMenuOpen: (open: boolean) => void;
  setFileMenuOpen: (open: boolean) => void;
  setViewMenuOpen: (open: boolean) => void;
  setHelpMenuOpen: (open: boolean) => void;
  closeAllMenus: () => void;
  setActiveSettingsGroup: (group: SettingsGroupId) => void;
  setSettingsSearchQuery: (query: string) => void;
  setNavigatorCollapsed: (tool: ToolId, collapsed: boolean) => void;
  toggleNavigator: (tool: ToolId) => void;
}
