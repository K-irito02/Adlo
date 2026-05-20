/**
 * Stores 模块索引文件
 * 提供渐进式 Store 重构的入口点
 */

// 导出所有工具模块
export * from "./cacheUtils";
export * from "./conversationUtils";
export * from "./shared";

// 导出子 Store 模块 (每个 store 有独立的选择器命名空间)
export { useWorkspaceStore, workspaceActions, type WorkspaceState } from "./useWorkspaceStore";
export { useSessionStore, sessionActions, sessionSelectors, type SessionState } from "./useSessionStore";
export { useEditorStore, editorActions, editorSelectors, type EditorState } from "./useEditorStore";
export { usePatchStore, patchActions, patchSelectors, type PatchState } from "./usePatchStore";

// 导出切片定义 (用于 Zustand 切片模式重构)
export * from "./slices";

// 导出集成指南
// @ts-ignore
export { default as INTEGRATION_GUIDE } from "./INTEGRATION_GUIDE.md";

// 导出通用选择器
export * from "./selectors";
