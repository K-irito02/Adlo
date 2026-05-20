/**
 * Store Slices - Zustand 切片模式定义和导出
 */

// UI 切片
export { type UISlice, createUISlice } from "./slices/uiSlice";

// 工作区切片
export { type WorkspaceSlice, createWorkspaceSlice } from "./slices/workspaceSlice";

// Git 切片
export { type GitSlice, createGitSlice } from "./slices/gitSlice";

// 会话切片
export { type SessionSlice, createSessionSlice } from "./slices/sessionSlice";

// 编辑器切片
export { type EditorSlice, createEditorSlice } from "./slices/editorSlice";

// 补丁切片
export { type PatchSlice, createPatchSlice } from "./slices/patchSlice";

// 搜索切片
export { type SearchSlice, createSearchSlice } from "./slices/searchSlice";

// 诊断切片
export { type DiagnosticSlice, createDiagnosticSlice } from "./slices/diagnosticSlice";

// 任务切片
export { type TaskSlice, createTaskSlice } from "./slices/taskSlice";

// 命令切片
export { type CommandSlice, createCommandSlice } from "./slices/commandSlice";
