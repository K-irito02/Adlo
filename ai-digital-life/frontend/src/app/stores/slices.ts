/**
 * Store Slices - Zustand 切片模式定义和导出
 *
 * ## 切片依赖关系
 *
 * 各切片之间存在隐式依赖关系，通过 `get()` 在 action 中访问：
 *
 * - `sessionSlice` ← `editorSlice`、`patchSlice`、`taskSlice`、`commandSlice`
 *   （依赖 `activeSessionId` 作为当前会话上下文）
 * - `workspaceSlice` ← `gitSlice`、`searchSlice`、`editorSlice`
 *   （依赖 `currentWorkspace` / `workspaceId` 作为文件操作上下文）
 * - `uiSlice` ← 所有切片（通过 `activeRightTool` 控制面板显示）
 * - `clipboardSlice` ← 无依赖（独立剪贴板状态）
 *
 * 依赖方向：切片 A ← 切片 B 表示 B 通过 get() 读取 A 的状态。
 * 所有跨切片访问在创建 store 时由 create() 注入 set/get 参数。
 */

// UI 切片
export { type UISlice, createUISlice } from './slices/uiSlice';

// 工作区切片
export { type WorkspaceSlice, createWorkspaceSlice } from './slices/workspaceSlice';

// Git 切片
export { type GitSlice, createGitSlice } from './slices/gitSlice';

// 编辑器切片
export { type EditorSlice, createEditorSlice } from './slices/editorSlice';

// 补丁切片
export { type PatchSlice, createPatchSlice } from './slices/patchSlice';

// 搜索切片
export { type SearchSlice, createSearchSlice } from './slices/searchSlice';

// 诊断切片
export { type DiagnosticSlice, createDiagnosticSlice } from './slices/diagnosticSlice';

// 剪贴板切片
export { type ClipboardSlice, createClipboardSlice } from './slices/clipboardSlice';

// 终端切片
export { type TerminalSlice, createTerminalSlice } from './slices/terminalSlice';

// 浏览器切片 — 5 个子切片
export {
  type BrowserTabsSlice,
  type BrowserTabState,
  type BrowserTabStateUpdate,
  createBrowserTabsSlice,
} from './slices/browserTabsSlice';
export {
  type BrowserBookmarkSlice,
  type BrowserBookmark,
  createBrowserBookmarkSlice,
} from './slices/browserBookmarkSlice';
export {
  type BrowserHistorySlice,
  type BrowserHistoryState,
  createBrowserHistorySlice,
} from './slices/browserHistorySlice';
export {
  type BrowserFoldersSlice,
  type BookmarkTabItem,
  type TabFolderState,
  type TabFolderStateUpdate,
  createBrowserFoldersSlice,
} from './slices/browserFoldersSlice';
export {
  type BrowserLandingSlice,
  type ShortcutSite,
  type LocalPort,
  type BackgroundConfig,
  type BackgroundMode,
  type BackgroundFit,
  createBrowserLandingSlice,
} from './slices/browserLandingSlice';

// 浏览器搜索引擎切片
export {
  type BrowserSearchEnginesSlice,
  type SearchEngine,
  createBrowserSearchEnginesSlice,
} from './slices/browserSearchEnginesSlice';

// 浏览器切片 — 核心层（组合所有子切片）
export { type BrowserSlice, createBrowserSlice } from './slices/browserSlice';

// CI 切片
export { type CiSlice, createCiSlice } from './slices/ciSlice';

// 通信切片
export {
  type CommunicateSlice,
  type PlatformId,
  createCommunicateSlice,
} from './slices/communicateSlice';

// GitHub Repo 切片（工作区配置、CI 目录管理、Pin/Unpin）
export {
  type GitHubRepoSlice,
  type GitWorkspaceCiConfig,
  type GitHubCiFolderState,
  createGitHubRepoSlice,
} from './slices/githubRepoSlice';

// GitHub Tree 切片（树导航、展开/折叠）
export {
  type GitHubTreeSlice,
  type GitHubTreeNodeType,
  type GitHubTreeNode,
  createGitHubTreeSlice,
} from './slices/githubTreeSlice';

// GitHub 切片（CI 配置 + CI 状态、分支/提交/远程操作）
export { type GitHubSlice, type GitHubSection, createGitHubSlice } from './slices/githubSlice';

// MCP 切片
export { type McpSlice, createMcpSlice } from './slices/mcpSlice';

// Web Tools 切片
export { type WebToolsSlice, createWebToolsSlice } from './slices/webToolsSlice';

// Reference 切片
export { type ReferenceSlice, createReferenceSlice } from './slices/referenceSlice';

// Toast 切片（全局通知）
export { type ToastSlice, createToastSlice } from './slices/toastSlice';

// 报错 Toast 切片（持久报错队列）
export { type ErrorToastSlice, createErrorToastSlice } from './slices/errorToastSlice';

// 通知切片（冲突通知与弹出式管理）
export {
  type NotificationSlice,
  type NotificationData,
  createNotificationSlice,
} from './slices/notificationSlice';

// 文件操作提示卡片切片（右下角警告卡片，如新建同名冲突）
export {
  type FileOpNoticeSlice,
  type FileOpNotice,
  createFileOpNoticeSlice,
} from './slices/fileOpNoticeSlice';

// 浏览器下载管理切片
export {
  type BrowserDownloadsSlice,
  createBrowserDownloadsSlice,
} from './slices/browserDownloadsSlice';
