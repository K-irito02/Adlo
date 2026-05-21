/**
 * Store - Zustand 状态管理（基于切片模式重构）
 * 已将跨切片 actions 按领域拆分到 actions/ 目录
 */

import { create } from "zustand";

import {
  createUISlice,
  createWorkspaceSlice,
  createGitSlice,
  createSessionSlice,
  createEditorSlice,
  createPatchSlice,
  createSearchSlice,
  createDiagnosticSlice,
  createTaskSlice,
  createCommandSlice,
  createClipboardSlice,
} from "./slices";
import type {
  UISlice,
  WorkspaceSlice,
  GitSlice,
  SessionSlice,
  EditorSlice,
  PatchSlice,
  SearchSlice,
  DiagnosticSlice,
  TaskSlice,
  CommandSlice,
  ClipboardSlice,
} from "./slices";
import type { StoreState as FullStoreState } from "./StoreState";

import {
  createWorkspaceActions,
  createSessionActions,
  createEditorActions,
  createPatchActions,
  createGitActions,
  createFetchActions,
  createStreamActions,
  createGeneralActions,
} from "./actions";

export {
  getWorkspaceCachePrefix,
  getWorkspaceScopedCacheKey,
  FILE_DOCUMENT_CACHE_LIMIT,
  CHANGE_PREVIEW_CACHE_LIMIT,
} from "./shared";

// 定义完整的 StoreState，与 StoreState.ts 保持一致
type StoreState = FullStoreState;

// 合并所有切片并添加跨切片的 actions
export const useSlicedAppStore = create<StoreState>((set, get) => ({
  // 合并所有基础切片
  ...createUISlice(set, get),
  ...createWorkspaceSlice(set, get),
  ...createGitSlice(set, get),
  ...createSessionSlice(set, get),
  ...createEditorSlice(set, get),
  ...createPatchSlice(set, get),
  ...createSearchSlice(set, get),
  ...createDiagnosticSlice(set, get),
  ...createTaskSlice(set, get),
  ...createCommandSlice(set, get),
  ...createClipboardSlice(set, get),

  // 根级状态
  loading: true,
  error: undefined,

  // 按领域拆分的跨切片 actions
  ...createWorkspaceActions(set, get),
  ...createSessionActions(set, get),
  ...createEditorActions(set, get),
  ...createPatchActions(set, get),
  ...createGitActions(set, get),
  ...createFetchActions(set, get),
  ...createStreamActions(set, get),
  ...createGeneralActions(set, get),
}));

export const useAppStore = useSlicedAppStore;
