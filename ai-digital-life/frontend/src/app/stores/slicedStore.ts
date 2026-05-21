/**
 * Store - Zustand 状态管理（基于切片模式重构）
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
import type {
  AppInfo,
  AppPreferencePatch,
  ConversationMessageRecord,
  DigitalLifeRunActivityEventV1,
  FileOutlineItem,
  IndexingStatus,
  ReorderSessionsInput,
  ReorderWorkspacesInput,
  WorkspaceGitBranchCreateInput,
  WorkspaceGitBranchSwitchInput,
} from "@ai-digital-life/kernel";
import { copy } from "../copy";
import { MODEL_PROVIDER_IDS } from "../constants";
import {
  createEditorTab,
  mapPatchToEditorTab,
  type EditorTabState,
} from "../editorTabs";
import { loadConversationState, loadTaskCenterState } from "../loaders";
import {
  mergeDirtyEditorPaths,
  normalizeWorkspaceRelativePath,
} from "../workspacePaths";
import { buildOutlineFromContent } from "../../shared/outline";
import { themeController } from "../theme";
import {
  applySlashScenarioOverride,
  augmentPromptWithChips,
  chatModeToScenario,
  type MessageSendOptions,
} from "../composerSend";
import { useUiStore, type ToolId } from "../ui-store";
import {
  workspaceRequestSeq,
  sessionRequestSeq,
  fileRequestSeq,
  changePreviewRequestSeq,
  getNextWorkspaceRequestSeq,
  getNextSessionRequestSeq,
  getNextFileRequestSeq,
  getNextChangePreviewRequestSeq,
  getFileDocumentCache,
  getChangePreviewCache,
  FILE_DOCUMENT_CACHE_LIMIT,
  CHANGE_PREVIEW_CACHE_LIMIT,
  getWorkspaceCachePrefix,
  getWorkspaceScopedCacheKey,
  getCachedLru as sharedGetCachedLru,
  setCachedLru as sharedSetCachedLru,
  queueLowPriorityRefresh,
  resetRequestSeqs,
  clearWorkspaceCaches,
  createDebouncedSearch,
  type CachedFileDocument,
  type CachedChangePreview,
} from "./shared";
import {
  sessionFallbackTitle,
  workspaceContextModeFromInfo,
  hasConversationMessages,
  refreshConversationSlice,
} from "./conversationUtils";

// 导出工具函数
export {
  getWorkspaceCachePrefix,
  getWorkspaceScopedCacheKey,
  FILE_DOCUMENT_CACHE_LIMIT,
  CHANGE_PREVIEW_CACHE_LIMIT,
};
export function getCachedLru<T>(
  cache: Map<string, T>,
  key: string
): T | undefined {
  return sharedGetCachedLru(cache, key);
}
export function setCachedLru<T>(
  cache: Map<string, T>,
  key: string,
  value: T,
  limit: number
): void {
  sharedSetCachedLru(cache, key, value, limit);
}

const fileDocumentCache = getFileDocumentCache();
const changePreviewCache = getChangePreviewCache();
const debouncedSearch = createDebouncedSearch(300);

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

  // ============================================
  // 跨切片的 actions
  // ============================================

  // 文件操作
  renameWorkspaceFile: async (relativePath, newName) => {
    const result = await window.digitalLife.workspace.renameFile(
      relativePath,
      newName
    );
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    await get().refreshWorkspaceTree();
    const currentPath = get().selectedFilePath;
    if (currentPath) {
      const parts = currentPath.split("/");
      parts[parts.length - 1] = newName;
      const newPath = parts.join("/");
      if (currentPath === relativePath) {
        await get().openFile(newPath);
      }
    }
  },

  deleteWorkspaceFile: async (relativePath) => {
    const result = await window.digitalLife.workspace.deleteFile(relativePath);
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    await get().refreshWorkspaceTree();
    const currentPath = get().selectedFilePath;
    if (currentPath === relativePath) {
      set({
        selectedFilePath: undefined,
        fileContent: undefined,
        openTabs: get().openTabs.filter((t) => t.path !== relativePath),
      });
    }
  },

  moveWorkspaceFile: async (relativePath, newPath) => {
    const result = await window.digitalLife.workspace.moveFile(
      relativePath,
      newPath
    );
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    await get().refreshWorkspaceTree();
  },

  duplicateWorkspaceFile: async (srcRelativePath, dstRelativePath) => {
    const result = await window.digitalLife.workspace.duplicateFile(
      srcRelativePath,
      dstRelativePath
    );
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    await get().refreshWorkspaceTree();
  },

  // 工作区 & 应用初始化
  bootstrap: async () => {
    const requestSeq = workspaceRequestSeq;
    set({ error: undefined });

    const [appInfoResult, recentResult, modelHealthResult] = await Promise.all(
      [
        window.digitalLife.app.getInfo(),
        window.digitalLife.workspace.listRecent(),
        window.digitalLife.app.getModelHealth(),
      ]
    );
    if (requestSeq !== workspaceRequestSeq) return;

    if (!appInfoResult.ok) {
      set({ loading: false, error: appInfoResult.error.message });
      return;
    }

    const [conversationState, taskCenter] = await Promise.all([
      loadConversationState(),
      loadTaskCenterState(),
    ]);
    if (requestSeq !== workspaceRequestSeq) return;

    const nextState: Partial<StoreState> = {
      appInfo: appInfoResult.data,
      modelHealth: modelHealthResult.ok ? modelHealthResult.data : undefined,
      recentWorkspaces: recentResult.ok ? recentResult.data : [],
      sessions: conversationState.sessions,
      activeSessionId: conversationState.activeSessionId,
      sessionDetails: conversationState.detail
        ? { [conversationState.detail.session.id]: conversationState.detail }
        : {},
      taskCenter,
      workspaceContextMode: workspaceContextModeFromInfo(appInfoResult.data),
      loading: false,
      dirtyEditorPaths: [],
    };

    void window.digitalLife.workspace.setEditorDirtyPaths([]);

    if (appInfoResult.data.currentWorkspace) {
      const [treeResult, gitStatusResult] = await Promise.all([
        window.digitalLife.workspace.listTree(),
        window.digitalLife.workspace.getGitStatus(),
      ]);
      if (requestSeq !== workspaceRequestSeq) return;

      const gitSnapshot = gitStatusResult.ok ? gitStatusResult.data : undefined;
      const appInfoWithGitSnapshot =
        gitSnapshot && appInfoResult.data.currentWorkspace
          ? {
              ...appInfoResult.data,
              currentWorkspace: {
                ...appInfoResult.data.currentWorkspace,
                gitSnapshot,
              },
            }
          : appInfoResult.data;

      set({
        ...nextState,
        appInfo: appInfoWithGitSnapshot,
        workspaceTree: treeResult.ok ? treeResult.data : [],
        gitSnapshot,
        dirtyEditorPaths: [],
      });

      if (conversationState.detail?.messages.length) {
        const patchBlock = conversationState.detail.messages
          .flatMap((message: ConversationMessageRecord) => message.blocks)
          .find((block) => block.type === "patch-summary");
        if (patchBlock?.type === "patch-summary") {
          const patchResult = await window.digitalLife.patch.getPatchSet(
            patchBlock.patchSetId
          );
          if (requestSeq !== workspaceRequestSeq) return;
          if (patchResult.ok) {
            const initialPath =
              patchResult.data?.filePatches[0]?.relativePath;
            set({
              activePatchSet: patchResult.data,
              selectedFilePath: initialPath,
              selectedChangePreviewPath: undefined,
              changePreview: undefined,
              changePreviewLoading: false,
              openTabs: initialPath ? [createEditorTab(initialPath)] : [],
            });
          }
        }
      }

      queueLowPriorityRefresh(async () => {
        if (requestSeq !== workspaceRequestSeq) return;
        await Promise.allSettled([
          get().fetchIndexStatus(),
          get().fetchAuditEntries(40),
          get().fetchCommandHistory(),
          get().fetchGitBranches(),
        ]);
      });
      return;
    }

    set({
      ...(nextState as StoreState),
      dirtyEditorPaths: [],
      openTabs: [],
      selectedFilePath: undefined,
      selectedChangePreviewPath: undefined,
      changePreview: undefined,
      changePreviewLoading: false,
      fileContent: undefined,
      fileLastModifiedAt: undefined,
      outline: [],
      workspaceTree: [],
      indexingStatus: undefined,
      repoMap: [],
      auditEntries: [],
      commandHistory: [],
      gitSnapshot: undefined,
      gitBranches: [],
      searchQuery: "",
      searchResults: [],
      externalFileChange: undefined,
    });
  },

  openWorkspace: async (workspacePath: string) => {
    const requestSeq = getNextWorkspaceRequestSeq();
    clearWorkspaceCaches(getWorkspaceCachePrefix(get().appInfo));
    getNextFileRequestSeq();
    getNextChangePreviewRequestSeq();
    getNextSessionRequestSeq();
    const result = await window.digitalLife.workspace.open(workspacePath);
    if (requestSeq !== workspaceRequestSeq)
      return { ok: false, error: "Request superseded" };
    if (!result.ok) {
      set({ error: result.error.message });
      return { ok: false, error: result.error.message };
    }
    await get().bootstrap();
    return { ok: true };
  },

  clearWorkspaceContext: async () => {
    const requestSeq = getNextWorkspaceRequestSeq();
    clearWorkspaceCaches(getWorkspaceCachePrefix(get().appInfo));
    getNextFileRequestSeq();
    getNextChangePreviewRequestSeq();
    getNextSessionRequestSeq();
    const result = await window.digitalLife.workspace.clearCurrent();
    if (requestSeq !== workspaceRequestSeq) return;
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    await get().bootstrap();
  },

  pickWorkspaceDirectory: async () => {
    const result = await window.digitalLife.workspace.pickDirectory();
    if (!result.ok) {
      set({ error: result.error.message });
      return undefined;
    }
    return result.data?.trim() || undefined;
  },

  // 会话相关
  createSession: async () => {
    const result = await window.digitalLife.conversation.createSession(
      sessionFallbackTitle(get().appInfo)
    );
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    const conversationState = await loadConversationState(result.data.id);
    set((state) => ({
      sessions: conversationState.sessions,
      activeSessionId: conversationState.activeSessionId,
      sessionDetails: conversationState.detail
        ? {
            ...state.sessionDetails,
            [conversationState.detail.session.id]: conversationState.detail,
          }
        : state.sessionDetails,
    }));
  },

  selectSession: async (sessionId: string) => {
    const requestSeq = getNextSessionRequestSeq();
    set({ activeSessionId: sessionId, error: undefined });
    const markReadResult = await window.digitalLife.conversation.markSessionRead(
      { sessionId }
    );
    if (requestSeq !== sessionRequestSeq) return;
    if (!markReadResult.ok) {
      set({ error: markReadResult.error.message });
      return;
    }
    const conversationState = await refreshConversationSlice(sessionId);
    if (requestSeq !== sessionRequestSeq) return;
    set((state) => ({
      sessions: conversationState.sessions,
      activeSessionId: conversationState.activeSessionId,
      sessionDetails: conversationState.detail
        ? {
            ...state.sessionDetails,
            [sessionId]: conversationState.detail,
          }
        : state.sessionDetails,
    }));
  },

  renameSession: async (sessionId: string, title: string) => {
    const result = await window.digitalLife.conversation.renameSession({
      sessionId,
      title,
    });
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    await refreshConversationSlice(get().activeSessionId ?? sessionId);
    set((state) => ({
      sessions: state.sessions,
      sessionDetails: state.sessionDetails[sessionId]
        ? {
            ...state.sessionDetails,
            [sessionId]: {
              ...state.sessionDetails[sessionId],
              session: result.data,
            },
          }
        : state.sessionDetails,
    }));
  },

  pinSession: async (sessionId: string) => {
    const result = await window.digitalLife.conversation.pinSession(sessionId);
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    const conversationState = await refreshConversationSlice(
      get().activeSessionId ?? sessionId
    );
    set({ sessions: conversationState.sessions });
  },

  unpinSession: async (sessionId: string) => {
    const result = await window.digitalLife.conversation.unpinSession(
      sessionId
    );
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    const conversationState = await refreshConversationSlice(
      get().activeSessionId ?? sessionId
    );
    set({ sessions: conversationState.sessions });
  },

  markSessionRead: async (sessionId: string) => {
    const result = await window.digitalLife.conversation.markSessionRead({
      sessionId,
    });
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    const conversationState = await refreshConversationSlice(
      get().activeSessionId ?? sessionId
    );
    set({ sessions: conversationState.sessions });
  },

  markSessionUnread: async (sessionId: string) => {
    const result = await window.digitalLife.conversation.markSessionUnread(
      sessionId
    );
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    const conversationState = await refreshConversationSlice(
      get().activeSessionId ?? sessionId
    );
    set({ sessions: conversationState.sessions });
  },

  archiveSession: async (sessionId: string) => {
    const result = await window.digitalLife.conversation.archiveSession(
      sessionId
    );
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    const conversationState = await refreshConversationSlice(
      get().activeSessionId
    );
    set({ sessions: conversationState.sessions });
  },

  archiveAllSessions: async () => {
    const result =
      await window.digitalLife.conversation.archiveAllInWorkspace();
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    const conversationState = await refreshConversationSlice(
      get().activeSessionId
    );
    set({ sessions: conversationState.sessions });
  },

  // 工作区操作
  pinWorkspace: async (workspaceId: string) => {
    const result = await window.digitalLife.workspace.pin(workspaceId);
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    set({ recentWorkspaces: result.data });
  },

  unpinWorkspace: async (workspaceId: string) => {
    const result = await window.digitalLife.workspace.unpin(workspaceId);
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    set({ recentWorkspaces: result.data });
  },

  removeWorkspaceFromSidebar: async (workspaceId: string) => {
    const result = await window.digitalLife.workspace.removeFromSidebar(
      workspaceId
    );
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    set({ recentWorkspaces: result.data });
    const appInfo = get().appInfo;
    if (appInfo?.currentWorkspace?.id === workspaceId) {
      await get().clearWorkspaceContext();
    }
  },

  reorderWorkspaces: async (input) => {
    const result = await window.digitalLife.workspace.reorder(input);
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    set({ recentWorkspaces: result.data });
  },

  reorderSessions: async (input) => {
    const result = await window.digitalLife.conversation.reorderSessions(input);
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    set({ sessions: result.data });
  },

  markAllSessionsRead: async (sessionIds) => {
    const results = await Promise.all(
      sessionIds.map((sessionId) =>
        window.digitalLife.conversation.markSessionRead({ sessionId })
      )
    );
    const failure = results.find((result) => !result.ok);
    if (failure && !failure.ok) {
      set({ error: failure.error.message });
      return;
    }
    const conversationState = await refreshConversationSlice(
      get().activeSessionId
    );
    set({ sessions: conversationState.sessions });
  },

  revealWorkspaceInFileManager: async (workspacePath) => {
    const result = await window.digitalLife.workspace.revealInFileManager(
      workspacePath
    );
    if (!result.ok) set({ error: result.error.message });
  },

  deleteSession: async (sessionId) => {
    const result = await window.digitalLife.conversation.deleteSession(
      sessionId
    );
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    const conversationState = await refreshConversationSlice(
      get().activeSessionId === sessionId ? undefined : get().activeSessionId
    );
    set((state) => {
      const nextDetails = { ...state.sessionDetails };
      delete nextDetails[sessionId];
      return {
        sessions: conversationState.sessions,
        activeSessionId: conversationState.activeSessionId,
        sessionDetails: nextDetails,
      };
    });
  },

  // 消息 & 流式输出
  sendMessage: async (content: string, options?: MessageSendOptions) => {
    if (!content.trim()) return;
    const trimmed = content.trim();
    if (trimmed === "/apply") {
      const ps = get().activePatchSet;
      if (ps) {
        await get().applyPatchSet(ps.id);
      } else {
        set({ error: "当前没有可应用的补丁。" });
      }
      return;
    }
    if (trimmed === "/rollback") {
      const ps = get().activePatchSet;
      if (ps) {
        await get().rollbackPatchSet(ps.id);
      } else {
        set({ error: "当前没有可回滚的补丁。" });
      }
      return;
    }
    if (trimmed === "/model") {
      useUiStore.getState().setActiveTool("models");
      return;
    }
    if (trimmed === "/clear") {
      set({
        error:
          "「/clear」尚未实现清空历史。请使用侧栏「新建会话」开始新线程，或删除当前会话。",
      });
      return;
    }
    const mode = options?.mode ?? useUiStore.getState().chatMode;
    const baseScenario = chatModeToScenario(mode);
    const withChips = augmentPromptWithChips(content, options?.chips);
    const { scenario, prompt } = applySlashScenarioOverride(
      withChips,
      baseScenario
    );
    set({
      streamingAssistantText: "",
      streamingActiveRunId: undefined,
      error: undefined,
    });
    const stateBeforeSend = get();
    let sessionId = stateBeforeSend.activeSessionId;

    if (!sessionId) {
      const created = await window.digitalLife.conversation.createSession(
        sessionFallbackTitle(get().appInfo)
      );
      if (!created.ok) {
        set({ error: created.error.message });
        return;
      }
      sessionId = created.data.id;
    }

    const unsubscribe = window.digitalLife.subscribeModelStream((event) => {
      if (event.v !== 1) return;
      set((state) => {
        if (event.type === "route")
          return { streamingActiveRunId: event.runId };
        if (event.type === "delta") {
          const nextRunId = state.streamingActiveRunId ?? event.runId;
          if (state.streamingActiveRunId && event.runId !== state.streamingActiveRunId)
            return state;
          return {
            streamingActiveRunId: nextRunId,
            streamingAssistantText: state.streamingAssistantText + event.text,
          };
        }
        if (event.type === "done")
          return {
            streamingAssistantText: "",
            streamingActiveRunId: undefined,
          };
        return state;
      });
    });

    const unsubscribeRunActivity = window.digitalLife.subscribeRunActivity(
      (event) => {
        if (event.v !== 1) return;
        set((state) => {
          const runId = event.runId;
          const prev = state.runActivityByRunId[runId] ?? [];
          const next =
            prev.length > 500
              ? [...prev.slice(-400), event]
              : [...prev, event];
          const usagePatch: Partial<StoreState> = {
            runActivityByRunId: { ...state.runActivityByRunId, [runId]: next },
          };
          if (event.type === "model" && event.usage) {
            usagePatch.runUsageByRunId = {
              ...state.runUsageByRunId,
              [runId]: event.usage,
            };
          }
          return usagePatch;
        });
      }
    );

    try {
      const result = await window.digitalLife.conversation.sendMessage({
        sessionId,
        content: prompt,
        scenario,
      });
      if (!result.ok) {
        set({ error: result.error.message });
        return;
      }

      const detailResult = await window.digitalLife.conversation.getSession(
        sessionId
      );
      if (!detailResult.ok) {
        set({ error: detailResult.error.message });
        return;
      }

      const appInfoResult = await window.digitalLife.app.getInfo();
      const nextAppInfo = appInfoResult.ok ? appInfoResult.data : get().appInfo;
      const conversationState = await refreshConversationSlice(sessionId);

      const nextState: Partial<StoreState> = {
        appInfo: nextAppInfo,
        sessions: conversationState.sessions,
        activeSessionId: conversationState.activeSessionId,
        activeRun: result.data.runDetail,
        activePatchSet: result.data.patchSet,
        openTabs:
          result.data.patchSet?.filePatches.map(mapPatchToEditorTab) ??
          get().openTabs,
        selectedFilePath: result.data.patchSet?.filePatches[0]?.relativePath,
        streamingAssistantText: "",
        streamingActiveRunId: undefined,
        workspaceContextMode: workspaceContextModeFromInfo(nextAppInfo),
      };

      if (result.data.patchSet?.filePatches[0]?.relativePath) {
        await get().openFile(result.data.patchSet.filePatches[0].relativePath);
      }

      set((state) => ({
        ...nextState,
        sessionDetails: detailResult.data
          ? {
              ...state.sessionDetails,
              [sessionId]: detailResult.data,
            }
          : state.sessionDetails,
      }));

      if (nextAppInfo?.currentWorkspace) {
        await Promise.allSettled([
          get().refreshWorkspaceTree(),
          get().fetchIndexStatus(),
          get().fetchRepoMap(),
          get().fetchGitStatus(),
          get().fetchGitBranches(),
        ]);
      } else {
        set({
          workspaceTree: [],
          indexingStatus: undefined,
          repoMap: [],
          gitSnapshot: undefined,
          gitBranches: [],
        });
      }
    } finally {
      unsubscribe();
      unsubscribeRunActivity();
      set({
        streamingAssistantText: "",
        streamingActiveRunId: undefined,
      });
    }
  },

  cancelActiveStream: async () => {
    const runId = get().streamingActiveRunId;
    if (!runId) return;
    const result = await window.digitalLife.conversation.cancelMessage(runId);
    if (!result.ok) set({ error: result.error.message });
  },

  // 编辑器相关
  openFile: async (relativePath: string) => {
    const requestSeq = getNextFileRequestSeq();
    const cacheKey = getWorkspaceScopedCacheKey(get().appInfo, relativePath);
    const cachedDocument = getCachedLru(fileDocumentCache, cacheKey);
    const applyDocument = (
      document: CachedFileDocument,
      outlineOverride?: FileOutlineItem[]
    ) => {
      const nextOutline =
        outlineOverride ?? buildOutlineFromContent(document.content, relativePath);
      const norm = normalizeWorkspaceRelativePath(relativePath);
      set((state) => {
        const nextDirty = state.dirtyEditorPaths.filter(
          (p) => normalizeWorkspaceRelativePath(p) !== norm
        );
        void window.digitalLife.workspace.setEditorDirtyPaths(nextDirty);
        return {
          error: undefined,
          openTabs: state.openTabs.some((tab) => tab.path === relativePath)
            ? state.openTabs
            : [...state.openTabs, createEditorTab(relativePath)],
          selectedFilePath: relativePath,
          fileContent: document.content,
          fileLastModifiedAt: document.lastModifiedAt,
          externalFileChange:
            state.externalFileChange?.path === relativePath
              ? undefined
              : state.externalFileChange,
          outline: nextOutline,
          dirtyEditorPaths: nextDirty,
        };
      });
    };

    if (cachedDocument) {
      applyDocument(cachedDocument);
      return;
    } else {
      set((state) => ({
        error: undefined,
        openTabs: state.openTabs.some((tab) => tab.path === relativePath)
          ? state.openTabs
          : [...state.openTabs, createEditorTab(relativePath)],
        selectedFilePath: relativePath,
      }));
    }

    const fileResult = await window.digitalLife.workspace.readFile(
      relativePath
    );
    if (requestSeq !== fileRequestSeq) return;
    if (!fileResult.ok) {
      set({ error: fileResult.error.message });
      return;
    }
    const nextOutline = buildOutlineFromContent(
      fileResult.data.content,
      relativePath
    );
    const nextDocument: CachedFileDocument = {
      content: fileResult.data.content,
      lastModifiedAt: fileResult.data.lastModifiedAt,
    };
    setCachedLru(fileDocumentCache, cacheKey, nextDocument, FILE_DOCUMENT_CACHE_LIMIT);
    applyDocument(nextDocument, nextOutline);
  },

  openChangePreview: async (relativePath: string) => {
    const requestSeq = getNextChangePreviewRequestSeq();
    const cacheKey = getWorkspaceScopedCacheKey(get().appInfo, relativePath);
    const cachedPreview = getCachedLru(changePreviewCache, cacheKey);
    set({
      selectedChangePreviewPath: relativePath,
      changePreview: cachedPreview ?? get().changePreview,
      changePreviewLoading: false,
      error: undefined,
    });
    const result = await window.digitalLife.workspace.getChangePreview(
      relativePath
    );
    if (requestSeq !== changePreviewRequestSeq) return;
    if (!result.ok) {
      set({
        selectedChangePreviewPath: relativePath,
        changePreviewLoading: false,
        changePreview:
          get().changePreview?.path === relativePath
            ? undefined
            : get().changePreview,
      });
      return;
    }
    setCachedLru(
      changePreviewCache,
      cacheKey,
      result.data,
      CHANGE_PREVIEW_CACHE_LIMIT
    );
    set({
      selectedChangePreviewPath: relativePath,
      changePreviewLoading: false,
      changePreview: result.data,
      error: undefined,
    });
  },

  createWorkspaceFile: async (relativePath: string, content = "") => {
    const result = await window.digitalLife.workspace.createFile(
      relativePath,
      content
    );
    if (!result.ok) {
      set({ error: result.error.message });
      return undefined;
    }
    await get().refreshWorkspaceTree();
    const nextOutline = buildOutlineFromContent(
      result.data.content,
      relativePath
    );
    const norm = normalizeWorkspaceRelativePath(relativePath);
    set((state) => {
      const nextDirty = state.dirtyEditorPaths.filter(
        (p) => normalizeWorkspaceRelativePath(p) !== norm
      );
      void window.digitalLife.workspace.setEditorDirtyPaths(nextDirty);
      return {
        error: undefined,
        openTabs: state.openTabs.some((tab) => tab.path === relativePath)
          ? state.openTabs
          : [...state.openTabs, createEditorTab(relativePath)],
        selectedFilePath: relativePath,
        fileContent: result.data.content,
        fileLastModifiedAt: result.data.lastModifiedAt,
        externalFileChange:
          state.externalFileChange?.path === relativePath
            ? undefined
            : state.externalFileChange,
        outline: nextOutline,
        dirtyEditorPaths: nextDirty,
      };
    });
    return relativePath;
  },

  createWorkspaceFolder: async (relativePath: string) => {
    const result = await window.digitalLife.workspace.createFolder(
      relativePath
    );
    if (!result.ok) {
      set({ error: result.error.message });
      return undefined;
    }
    await get().refreshWorkspaceTree();
    set({ error: undefined });
    return relativePath;
  },

  // 搜索 & 刷新
  refreshWorkspaceTree: async () => {
    const result = await window.digitalLife.workspace.listTree();
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    set({ error: undefined, workspaceTree: result.data });
  },

  searchFiles: async (query: string) => {
    set({ searchQuery: query });
    if (!query.trim()) {
      set({ searchResults: [] });
      return;
    }
    debouncedSearch(query, async () => {
      if (get().searchQuery !== query) return;
      const result = await window.digitalLife.workspace.search(query);
      if (get().searchQuery !== query) return;
      if (!result.ok) {
        set({ error: result.error.message });
        return;
      }
      set({ searchResults: result.data });
    });
  },

  // 补丁相关
  setHunkDecision: async (patchSetId, hunkId, decision) => {
    const result = await window.digitalLife.patch.setHunkDecision({
      patchSetId,
      hunkId,
      decision,
    });
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    set({ activePatchSet: result.data });
  },

  applyPatchSet: async (patchSetId: string) => {
    const result = await window.digitalLife.patch.applyPatchSet(patchSetId);
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    set({
      activePatchSet: result.data.repairPatchSet ?? result.data.patchSet,
      latestPatchApplication: result.data,
      latestCommandRun: result.data.commandResult
        ? {
            status: "completed",
            taskId: result.data.commandResult.request.id,
            request: result.data.commandResult.request,
            result: result.data.commandResult,
          }
        : undefined,
      openTabs: (result.data.repairPatchSet ?? result.data.patchSet).filePatches.map(
        mapPatchToEditorTab
      ),
    });
    const detail = get().activeSessionId
      ? await window.digitalLife.conversation.getSession(get().activeSessionId!)
      : undefined;
    if (detail?.ok && detail.data && get().activeSessionId) {
      set((state) => ({
        sessionDetails: {
          ...state.sessionDetails,
          [get().activeSessionId!]: detail.data!,
        },
      }));
    }
    const filePath = (result.data.repairPatchSet ?? result.data.patchSet).filePatches[0]?.relativePath;
    if (filePath) await get().openFile(filePath);
    const runId = result.data.patchSet.runId;
    if (runId) {
      const run = await window.digitalLife.agent.getRun(runId);
      if (run.ok) set({ activeRun: run.data });
    }
    await get().refreshTaskCenter();
    await get().fetchAuditEntries(40);
    await get().fetchCommandHistory();
    await get().fetchGitStatus();
  },

  rollbackPatchSet: async (patchSetId: string) => {
    const result = await window.digitalLife.patch.rollbackPatchSet(patchSetId);
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    set({
      activePatchSet: result.data,
      openTabs: result.data.filePatches.map(mapPatchToEditorTab),
    });
    const filePath = result.data.filePatches[0]?.relativePath;
    if (filePath) await get().openFile(filePath);
    const runId = result.data.runId;
    if (runId) {
      const run = await window.digitalLife.agent.getRun(runId);
      if (run.ok) set({ activeRun: run.data });
    }
    await get().refreshTaskCenter();
    await get().fetchAuditEntries(40);
    await get().fetchGitStatus();
  },

  // 任务中心
  refreshTaskCenter: async () => {
    const result = await window.digitalLife.task.getSnapshot();
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    set({ taskCenter: result.data });
  },

  decideApproval: async (approvalId, decision) => {
    const result = await window.digitalLife.task.decideApproval({
      approvalId,
      decision,
    });
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    set({
      taskCenter: result.data,
      latestCommandRun: undefined,
    });
    await get().fetchAuditEntries(40);
    await get().fetchCommandHistory();
    await get().fetchGitStatus();
  },

  // 编辑器通知
  markExternalFileChange: ({ path, lastModifiedAt }) => {
    const selected = normalizeWorkspaceRelativePath(
      get().selectedFilePath ?? ""
    );
    const incoming = normalizeWorkspaceRelativePath(path);
    if (!selected || selected !== incoming) return;
    if (
      typeof get().fileLastModifiedAt === "number" &&
      get().fileLastModifiedAt === lastModifiedAt
    )
      return;
    console.info("[workspace] external file changed", {
      path: incoming,
      lastModifiedAt,
    });
    set((state) => {
      const nextDirty = [...new Set([...state.dirtyEditorPaths, incoming])];
      void window.digitalLife.workspace.setEditorDirtyPaths(nextDirty);
      return {
        externalFileChange: { path, lastModifiedAt },
        dirtyEditorPaths: nextDirty,
      };
    });
  },

  notifyEditorBufferDirty: (relativePath: string, isDirty: boolean) => {
    set((state) => {
      const nextDirty = mergeDirtyEditorPaths(
        state.dirtyEditorPaths,
        relativePath,
        isDirty
      );
      void window.digitalLife.workspace.setEditorDirtyPaths(nextDirty);
      return { dirtyEditorPaths: nextDirty };
    });
  },

  // 命令
  runCommand: async (command, argsText) => {
    if (!command.trim()) return;
    const args = argsText
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean);
    const result = await window.digitalLife.command.run({
      command: command.trim(),
      args,
    });
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    set({ latestCommandRun: result.data });
    await get().refreshTaskCenter();
    await get().fetchAuditEntries(40);
    await get().fetchCommandHistory();
    await get().fetchGitStatus();
  },

  refreshModelHealth: async () => {
    const result = await window.digitalLife.app.getModelHealth();
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    set({ modelHealth: result.data });
  },

  updatePreferences: async (patch) => {
    const result = await window.digitalLife.app.updatePreferences(patch);
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    themeController.setTheme({
      mode: result.data.config.themeMode,
      resolvedTheme: result.data.config.resolvedTheme,
    });
    themeController.hydrate();
    set((state) => ({
      appInfo: result.data,
      sessions: state.sessions,
    }));
    if (patch.modelPreferences) await get().refreshModelHealth();
  },

  fetchIndexStatus: async () => {
    const result = await window.digitalLife.retrieval.getStatus();
    if (result.ok && result.data) {
      const snap = result.data;
      const stateMap: Record<string, IndexingStatus["state"]> = {
        idle: "idle",
        running: "indexing",
        completed: "indexed",
        failed: "error",
      };
      const status: IndexingStatus = {
        state: stateMap[snap.status] ?? "idle",
        scannedFiles: snap.scannedFiles,
        totalFiles: snap.scannedFiles,
        excludedFiles: snap.scannedFiles - snap.indexedTextFiles,
        lastIndexedAt: snap.completedAt,
        error: snap.lastError,
      };
      set({ indexingStatus: status });
    }
  },

  fetchRepoMap: async () => {
    const result = await window.digitalLife.retrieval.getRepoMap();
    if (result.ok) set({ repoMap: result.data });
  },

  fetchAuditEntries: async (limit?: number) => {
    const result = await window.digitalLife.task.listAuditEntries(limit);
    if (result.ok) {
      set((state) => {
        const runIdRe = /runId=([A-Za-z0-9_-]+)/;
        const nextRunActivity = { ...state.runActivityByRunId };
        for (let idx = 0; idx < result.data.length; idx += 1) {
          const entry = result.data[idx]!;
          const detail = entry.detail ?? "";
          const match = detail.match(runIdRe);
          if (!match) continue;
          const runId = match[1]!;
          const existing = nextRunActivity[runId] ?? [];
          const seq = Number(entry.timestamp) * 1000 + idx;
          const base = {
            v: 1 as const,
            runId,
            seq,
            ts: entry.timestamp,
          };
          let event: DigitalLifeRunActivityEventV1;
          const op = entry.operationType as unknown as string;
          if (op === "file-read") {
            const path =
              entry.summary.split(":").slice(1).join(":").trim() ||
              entry.summary;
            event = { ...base, type: "file-read", path };
          } else if (op === "search") {
            const q = entry.summary.match(/`([^`]+)`/)?.[1] ?? entry.summary;
            event = { ...base, type: "search", query: q };
          } else if (op === "model") {
            event = {
              ...base,
              type: "model",
              phase: "done",
              message: entry.summary,
            };
          } else {
            event = {
              ...base,
              type: "error",
              message: `${op}: ${entry.summary}`,
            };
          }
          const already = existing.some((e) => e.seq === event.seq);
          if (!already)
            nextRunActivity[runId] = [...existing, event].sort(
              (a, b) => a.seq - b.seq
            );
        }
        return {
          auditEntries: result.data,
          runActivityByRunId: nextRunActivity,
        };
      });
    }
  },

  fetchRunActivityByRunId: async (runId: string, limit?: number) => {
    const existing = get().runActivityByRunId[runId];
    if (existing && existing.length > 0) return;
    const result = await window.digitalLife.runActivity.listByRunId(
      runId,
      limit
    );
    if (!result.ok) return;
    set((state) => ({
      runActivityByRunId: {
        ...state.runActivityByRunId,
        [runId]: result.data,
      },
    }));
  },

  fetchCommandHistory: async () => {
    const result = await window.digitalLife.command.listRecent(20);
    if (result.ok) {
      set({
        commandHistory: result.data.map(
          (item: { command: string; args: string[] }) =>
            `${item.command} ${item.args.join(" ")}`.trim()
        ),
      });
    }
  },

  fetchGitStatus: async () => {
    if (!get().appInfo?.currentWorkspace) {
      set({
        gitSnapshot: undefined,
        selectedChangePreviewPath: undefined,
        changePreview: undefined,
        changePreviewLoading: false,
      });
      return;
    }
    const result = await window.digitalLife.workspace.getGitStatus();
    if (result.ok) {
      set((state) => ({
        gitSnapshot: result.data,
        appInfo:
          state.appInfo && state.appInfo.currentWorkspace
            ? {
                ...state.appInfo,
                currentWorkspace: {
                  ...state.appInfo.currentWorkspace,
                  gitSnapshot: result.data,
                },
              }
            : state.appInfo,
      }));
      const selectedChangePreviewPath = get().selectedChangePreviewPath;
      if (!selectedChangePreviewPath) return;
      const changedPaths = new Set([
        ...result.data.staged,
        ...result.data.unstaged,
        ...result.data.untracked,
        ...result.data.conflicts,
      ]);
      if (!changedPaths.has(selectedChangePreviewPath)) {
        set({
          selectedChangePreviewPath: undefined,
          changePreview: undefined,
          changePreviewLoading: false,
        });
        return;
      }
      await get().openChangePreview(selectedChangePreviewPath);
    }
  },

  fetchGitBranches: async () => {
    if (!get().appInfo?.currentWorkspace) {
      set({ gitBranches: [] });
      return;
    }
    const result = await window.digitalLife.workspace.listGitBranches();
    if (!result.ok) {
      set({ error: result.error.message, gitBranches: [] });
      return;
    }
    set({ error: undefined, gitBranches: result.data });
  },

  switchGitBranch: async (input) => {
    const result = await window.digitalLife.workspace.switchGitBranch(input);
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    set((state) => ({
      appInfo: state.appInfo
        ? {
            ...state.appInfo,
            currentWorkspace: result.data.workspace,
          }
        : state.appInfo,
      gitSnapshot: result.data.gitSnapshot,
      workspaceContextMode: "workspace",
    }));
    await Promise.allSettled([
      get().refreshWorkspaceTree(),
      get().fetchIndexStatus(),
      get().fetchRepoMap(),
      get().fetchGitStatus(),
      get().fetchGitBranches(),
    ]);
    if (get().selectedFilePath) await get().openFile(get().selectedFilePath!);
  },

  createGitBranch: async (input) => {
    const result = await window.digitalLife.workspace.createGitBranch(input);
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    set((state) => ({
      appInfo: state.appInfo
        ? {
            ...state.appInfo,
            currentWorkspace: result.data.workspace,
          }
        : state.appInfo,
      gitSnapshot: result.data.gitSnapshot,
      workspaceContextMode: "workspace",
    }));
    await Promise.allSettled([
      get().refreshWorkspaceTree(),
      get().fetchIndexStatus(),
      get().fetchRepoMap(),
      get().fetchGitStatus(),
      get().fetchGitBranches(),
    ]);
    if (get().selectedFilePath) await get().openFile(get().selectedFilePath!);
  },

  acceptAllHunks: async () => {
    const patchSet = get().activePatchSet;
    if (!patchSet) return;
    for (const filePatch of patchSet.filePatches) {
      for (const hunk of filePatch.hunks) {
        if (hunk.decision !== "accepted")
          await get().setHunkDecision(patchSet.id, hunk.id, "accepted");
      }
    }
  },

  rejectAllHunks: async () => {
    const patchSet = get().activePatchSet;
    if (!patchSet) return;
    for (const filePatch of patchSet.filePatches) {
      for (const hunk of filePatch.hunks) {
        if (hunk.decision !== "rejected")
          await get().setHunkDecision(patchSet.id, hunk.id, "rejected");
      }
    }
  },

  restoreCheckpoint: async (checkpointId: string) => {
    const result = await window.digitalLife.task.restoreCheckpoint(
      checkpointId
    );
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    set({ taskCenter: result.data });
    await get().fetchAuditEntries(40);
    await get().bootstrap();
  },
}));

export const useAppStore = useSlicedAppStore;
