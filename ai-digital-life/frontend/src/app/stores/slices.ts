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

// 会话切片
export { type SessionSlice, createSessionSlice } from './slices/sessionSlice';

// 编辑器切片
export { type EditorSlice, createEditorSlice } from './slices/editorSlice';

// 补丁切片
export { type PatchSlice, createPatchSlice } from './slices/patchSlice';

// 搜索切片
export { type SearchSlice, createSearchSlice } from './slices/searchSlice';

// 诊断切片
export { type DiagnosticSlice, createDiagnosticSlice } from './slices/diagnosticSlice';

// 任务切片
export { type TaskSlice, createTaskSlice } from './slices/taskSlice';

// 命令切片
export { type CommandSlice, createCommandSlice } from './slices/commandSlice';

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

// GitHub 切片
export {
  type GitHubSlice,
  type GitHubSection,
  type GitWorkspaceCiConfig,
  type GitHubCiFolderState,
  createGitHubSlice,
} from './slices/githubSlice';
