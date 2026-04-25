import { create } from "zustand";
import type {
  AgentRunDetail,
  AppInfo,
  AppPreferencePatch,
  AuditEntry,
  CommandRunResult,
  ConversationDetail,
  ConversationMessageRecord,
  ConversationSessionRecord,
  DiagnosticSummary,
  FileOutlineItem,
  GitSnapshot,
  IndexingState,
  IndexingStatus,
  ModelGatewayHealthSnapshot,
  ModelProviderId,
  FilePatch,
  PatchApplicationResult,
  PatchSet,
  ReorderSessionsInput,
  ReorderWorkspacesInput,
  RecentWorkspaceEntry,
  RepoMapNode,
  TaskCenterSnapshot,
  WorkspaceTreeNode,
  WorkspaceSearchHit
} from "@ai-digital-life/kernel";
import { copy } from "./copy";
import { MODEL_PROVIDER_IDS } from "./constants";
import { createEditorTab, mapPatchToEditorTab, type EditorTabState } from "./editorTabs";
import { loadConversationState, loadTaskCenterState } from "./loaders";
import { mergeDirtyEditorPaths, normalizeWorkspaceRelativePath } from "./workspacePaths";
import { themeController } from "./theme";
import type { ToolId } from "./ui-store";

let terminalStreamUnsub: (() => void) | undefined;

async function refreshConversationSlice(activeSessionId?: string) {
  const conversationState = await loadConversationState(activeSessionId);
  return {
    sessions: conversationState.sessions,
    activeSessionId: conversationState.activeSessionId,
    detail: conversationState.detail
  };
}

export type StoreState = {
  loading: boolean;
  error?: string;
  appInfo?: AppInfo;
  recentWorkspaces: RecentWorkspaceEntry[];
  sessions: ConversationSessionRecord[];
  activeSessionId?: string;
  sessionDetails: Record<string, ConversationDetail>;
  activeRun?: AgentRunDetail;
  activePatchSet?: PatchSet;
  latestPatchApplication?: PatchApplicationResult;
  taskCenter?: TaskCenterSnapshot;
  modelHealth?: ModelGatewayHealthSnapshot;
  latestCommandRun?: CommandRunResult;
  terminalOutput: string;
  activeTerminalExecutionId?: string;
  streamingAssistantText: string;
  streamingActiveRunId?: string;
  openTabs: EditorTabState[];
  selectedFilePath?: string;
  fileContent?: string;
  fileLastModifiedAt?: number;
  externalFileChange?: { path: string; lastModifiedAt: number };
  outline: FileOutlineItem[];
  workspaceTree: WorkspaceTreeNode[];
  searchQuery: string;
  searchResults: WorkspaceSearchHit[];
  /** Workspace-relative paths considered dirty vs last loaded disk snapshot (synced to Main for patch guards). */
  dirtyEditorPaths: string[];
  indexingStatus?: IndexingStatus;
  repoMap: RepoMapNode[];
  auditEntries: AuditEntry[];
  commandHistory: string[];
  gitSnapshot?: GitSnapshot;
  /* ---------- UI layout state ---------- */
  leftSidebarVisible: boolean;
  rightPanelVisible: boolean;
  activeRightTool: ToolId;
  currentModel: string;
  composerMessage: string;
  setLeftSidebarVisible: (visible: boolean) => void;
  setRightPanelVisible: (visible: boolean) => void;
  setActiveRightTool: (tool: ToolId) => void;
  setCurrentModel: (model: string) => void;
  setComposerMessage: (message: string) => void;
  toggleLeftSidebar: () => void;
  toggleRightSidebar: () => void;
  bootstrap: () => Promise<void>;
  openWorkspace: (workspacePath: string) => Promise<void>;
  createSession: () => Promise<void>;
  selectSession: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, title: string) => Promise<void>;
  pinSession: (sessionId: string) => Promise<void>;
  unpinSession: (sessionId: string) => Promise<void>;
  markSessionRead: (sessionId: string) => Promise<void>;
  markSessionUnread: (sessionId: string) => Promise<void>;
  archiveSession: (sessionId: string) => Promise<void>;
  archiveAllSessions: () => Promise<void>;
  pinWorkspace: (workspaceId: string) => Promise<void>;
  unpinWorkspace: (workspaceId: string) => Promise<void>;
  removeWorkspaceFromSidebar: (workspaceId: string) => Promise<void>;
  reorderWorkspaces: (input: ReorderWorkspacesInput) => Promise<void>;
  reorderSessions: (input: ReorderSessionsInput) => Promise<void>;
  markAllSessionsRead: (sessionIds: string[]) => Promise<void>;
  revealWorkspaceInFileManager: (workspacePath: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  cancelActiveStream: () => Promise<void>;
  openFile: (relativePath: string) => Promise<void>;
  refreshWorkspaceTree: () => Promise<void>;
  searchFiles: (query: string) => Promise<void>;
  setHunkDecision: (patchSetId: string, hunkId: string, decision: "pending" | "accepted" | "rejected") => Promise<void>;
  applyPatchSet: (patchSetId: string) => Promise<void>;
  rollbackPatchSet: (patchSetId: string) => Promise<void>;
  refreshTaskCenter: () => Promise<void>;
  decideApproval: (approvalId: string, decision: "approved" | "rejected") => Promise<void>;
  markExternalFileChange: (input: { path: string; lastModifiedAt: number }) => void;
  notifyEditorBufferDirty: (relativePath: string, isDirty: boolean) => void;
  runCommand: (command: string, argsText: string) => Promise<void>;
  runCommandStream: (command: string, argsText: string) => Promise<void>;
  stopCommandStream: () => Promise<void>;
  refreshModelHealth: () => Promise<void>;
  updatePreferences: (patch: AppPreferencePatch) => Promise<void>;
  fetchIndexStatus: () => Promise<void>;
  fetchRepoMap: () => Promise<void>;
  fetchAuditEntries: (limit?: number) => Promise<void>;
  fetchCommandHistory: () => Promise<void>;
  fetchGitStatus: () => Promise<void>;
  acceptAllHunks: () => Promise<void>;
  rejectAllHunks: () => Promise<void>;
  restoreCheckpoint: (checkpointId: string) => Promise<void>;
};

export const useAppStore = create<StoreState>((set, get) => ({
  loading: true,
  recentWorkspaces: [],
  sessions: [],
  sessionDetails: {},
  openTabs: [],
  outline: [],
  workspaceTree: [],
  searchQuery: "",
  searchResults: [],
  streamingAssistantText: "",
  terminalOutput: "",
  dirtyEditorPaths: [],
  repoMap: [],
  auditEntries: [],
  commandHistory: [],
  leftSidebarVisible: true,
  rightPanelVisible: true,
  activeRightTool: 'files',
  currentModel: 'GPT-4o',
  composerMessage: '',
  bootstrap: async () => {
    set({ loading: true, error: undefined });

    const [appInfoResult, recentResult, modelHealthResult] = await Promise.all([
      window.digitalLife.app.getInfo(),
      window.digitalLife.workspace.listRecent(),
      window.digitalLife.app.getModelHealth()
    ]);

    if (!appInfoResult.ok) {
      set({ loading: false, error: appInfoResult.error.message });
      return;
    }

    const nextState: Partial<StoreState> = {
      appInfo: appInfoResult.data,
      modelHealth: modelHealthResult.ok ? modelHealthResult.data : undefined,
      recentWorkspaces: recentResult.ok ? recentResult.data : [],
      loading: false,
      dirtyEditorPaths: []
    };

    void window.digitalLife.workspace.setEditorDirtyPaths([]);

    if (appInfoResult.data.currentWorkspace) {
      const treeResult = await window.digitalLife.workspace.listTree();
      const conversationState = await loadConversationState();
      const taskCenter = await loadTaskCenterState();
      set({
        ...nextState,
        taskCenter,
        workspaceTree: treeResult.ok ? treeResult.data : [],
        sessions: conversationState.sessions,
        activeSessionId: conversationState.activeSessionId,
        sessionDetails: conversationState.detail
          ? { [conversationState.detail.session.id]: conversationState.detail }
          : {},
        dirtyEditorPaths: []
      });
      if (conversationState.detail?.messages.length) {
        const patchBlock = conversationState.detail.messages
          .flatMap((message: ConversationMessageRecord) => message.blocks)
          .find((block) => block.type === "patch-summary");
        if (patchBlock?.type === "patch-summary") {
          const patchResult = await window.digitalLife.patch.getPatchSet(patchBlock.patchSetId);
          if (patchResult.ok) {
            const initialPath = patchResult.data?.filePatches[0]?.relativePath;
            set({
              activePatchSet: patchResult.data,
              selectedFilePath: initialPath,
              openTabs: initialPath ? [createEditorTab(initialPath)] : []
            });
          }
        }
      }
      return;
    }

    set({ ...(nextState as StoreState), dirtyEditorPaths: [], workspaceTree: [] });
  },
  openWorkspace: async (workspacePath: string) => {
    const result = await window.digitalLife.workspace.open(workspacePath);
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    await get().bootstrap();
  },
  createSession: async () => {
    const label =
      get().appInfo?.config.language === "en-US" ? copy["en-US"].sessionFallback : copy["zh-CN"].sessionFallback;
    const result = await window.digitalLife.conversation.createSession(label);
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    const conversationState = await loadConversationState(result.data.id);
    set((state) => ({
      sessions: conversationState.sessions,
      activeSessionId: conversationState.activeSessionId,
      sessionDetails: conversationState.detail
        ? { ...state.sessionDetails, [conversationState.detail.session.id]: conversationState.detail }
        : state.sessionDetails
    }));
  },
  selectSession: async (sessionId: string) => {
    const markReadResult = await window.digitalLife.conversation.markSessionRead({ sessionId });
    if (!markReadResult.ok) {
      set({ error: markReadResult.error.message });
      return;
    }
    const result = await window.digitalLife.conversation.getSession(sessionId);
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    const conversationState = await refreshConversationSlice(sessionId);
    set((state) => ({
      sessions: conversationState.sessions,
      activeSessionId: sessionId,
      sessionDetails: result.data ? { ...state.sessionDetails, [sessionId]: result.data } : state.sessionDetails
    }));
  },
  renameSession: async (sessionId: string, title: string) => {
    const result = await window.digitalLife.conversation.renameSession({ sessionId, title });
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    const conversationState = await refreshConversationSlice(get().activeSessionId ?? sessionId);
    set((state) => ({
      sessions: conversationState.sessions,
      sessionDetails:
        state.sessionDetails[sessionId]
          ? {
              ...state.sessionDetails,
              [sessionId]: {
                ...state.sessionDetails[sessionId],
                session: result.data
              }
            }
          : state.sessionDetails
    }));
  },
  pinSession: async (sessionId: string) => {
    const result = await window.digitalLife.conversation.pinSession(sessionId);
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    const conversationState = await refreshConversationSlice(get().activeSessionId ?? sessionId);
    set({ sessions: conversationState.sessions });
  },
  unpinSession: async (sessionId: string) => {
    const result = await window.digitalLife.conversation.unpinSession(sessionId);
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    const conversationState = await refreshConversationSlice(get().activeSessionId ?? sessionId);
    set({ sessions: conversationState.sessions });
  },
  markSessionRead: async (sessionId: string) => {
    const result = await window.digitalLife.conversation.markSessionRead({ sessionId });
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    const conversationState = await refreshConversationSlice(get().activeSessionId ?? sessionId);
    set({ sessions: conversationState.sessions });
  },
  markSessionUnread: async (sessionId: string) => {
    const result = await window.digitalLife.conversation.markSessionUnread(sessionId);
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    const conversationState = await refreshConversationSlice(get().activeSessionId ?? sessionId);
    set({ sessions: conversationState.sessions });
  },
  archiveSession: async (sessionId: string) => {
    const result = await window.digitalLife.conversation.archiveSession(sessionId);
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    const conversationState = await refreshConversationSlice(get().activeSessionId);
    set({ sessions: conversationState.sessions });
  },
  archiveAllSessions: async () => {
    const result = await window.digitalLife.conversation.archiveAllInWorkspace();
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    const conversationState = await refreshConversationSlice(get().activeSessionId);
    set({ sessions: conversationState.sessions });
  },
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
    const result = await window.digitalLife.workspace.removeFromSidebar(workspaceId);
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    set({ recentWorkspaces: result.data });
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
    const results = await Promise.all(sessionIds.map((sessionId) => window.digitalLife.conversation.markSessionRead({ sessionId })));
    const failure = results.find((result) => !result.ok);
    if (failure && !failure.ok) {
      set({ error: failure.error.message });
      return;
    }
    const conversationState = await refreshConversationSlice(get().activeSessionId);
    set({ sessions: conversationState.sessions });
  },
  revealWorkspaceInFileManager: async (workspacePath) => {
    const result = await window.digitalLife.workspace.revealInFileManager(workspacePath);
    if (!result.ok) {
      set({ error: result.error.message });
    }
  },
  deleteSession: async (sessionId) => {
    const result = await window.digitalLife.conversation.deleteSession(sessionId);
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
        sessionDetails: nextDetails
      };
    });
  },
  sendMessage: async (content: string) => {
    const sessionId = get().activeSessionId;
    if (!sessionId || !content.trim()) {
      return;
    }
    set({ streamingAssistantText: "", streamingActiveRunId: undefined, error: undefined });
    const unsubscribe = window.digitalLife.subscribeModelStream((event) => {
      if (event.v !== 1) {
        return;
      }
      set((state) => {
        if (event.type === "route") {
          return { streamingActiveRunId: event.runId };
        }
        if (event.type === "delta") {
          const nextRunId = state.streamingActiveRunId ?? event.runId;
          if (state.streamingActiveRunId && event.runId !== state.streamingActiveRunId) {
            return state;
          }
          return {
            streamingActiveRunId: nextRunId,
            streamingAssistantText: state.streamingAssistantText + event.text
          };
        }
        if (event.type === "done") {
          return { streamingAssistantText: "", streamingActiveRunId: undefined };
        }
        return state;
      });
    });

    try {
      const result = await window.digitalLife.conversation.sendMessage({
        sessionId,
        content,
        scenario: "code-edit"
      });
      if (!result.ok) {
        set({ error: result.error.message });
        return;
      }

      const detailResult = await window.digitalLife.conversation.getSession(sessionId);
      if (!detailResult.ok) {
        set({ error: detailResult.error.message });
        return;
      }

      const nextState: Partial<StoreState> = {
        activeRun: result.data.runDetail,
        activePatchSet: result.data.patchSet,
        openTabs: result.data.patchSet?.filePatches.map(mapPatchToEditorTab) ?? get().openTabs,
        selectedFilePath: result.data.patchSet?.filePatches[0]?.relativePath,
        streamingAssistantText: "",
        streamingActiveRunId: undefined
      };

      if (result.data.patchSet?.filePatches[0]?.relativePath) {
        await get().openFile(result.data.patchSet.filePatches[0].relativePath);
      }

      set((state) => ({
        ...nextState,
        sessionDetails: detailResult.data ? { ...state.sessionDetails, [sessionId]: detailResult.data } : state.sessionDetails
      }));
    } finally {
      unsubscribe();
      set({ streamingAssistantText: "", streamingActiveRunId: undefined });
    }
  },
  cancelActiveStream: async () => {
    const runId = get().streamingActiveRunId;
    if (!runId) {
      return;
    }
    const result = await window.digitalLife.conversation.cancelMessage(runId);
    if (!result.ok) {
      set({ error: result.error.message });
    }
  },
  openFile: async (relativePath: string) => {
    const [fileResult, outlineResult] = await Promise.all([
      window.digitalLife.workspace.readFile(relativePath),
      window.digitalLife.workspace.outline(relativePath)
    ]);
    if (!fileResult.ok) {
      set({ error: fileResult.error.message });
      return;
    }
    const norm = normalizeWorkspaceRelativePath(relativePath);
    set((state) => {
      const nextDirty = state.dirtyEditorPaths.filter((p) => normalizeWorkspaceRelativePath(p) !== norm);
      void window.digitalLife.workspace.setEditorDirtyPaths(nextDirty);
      return {
        openTabs: state.openTabs.some((tab) => tab.path === relativePath)
          ? state.openTabs
          : [...state.openTabs, createEditorTab(relativePath)],
        selectedFilePath: relativePath,
        fileContent: fileResult.data.content,
        fileLastModifiedAt: fileResult.data.lastModifiedAt,
        externalFileChange: state.externalFileChange?.path === relativePath ? undefined : state.externalFileChange,
        outline: outlineResult.ok ? outlineResult.data : [],
        dirtyEditorPaths: nextDirty
      };
    });
  },
  refreshWorkspaceTree: async () => {
    const result = await window.digitalLife.workspace.listTree();
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    set({ workspaceTree: result.data });
  },
  searchFiles: async (query: string) => {
    set({ searchQuery: query });
    if (!query.trim()) {
      set({ searchResults: [] });
      return;
    }
    const result = await window.digitalLife.workspace.search(query);
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    set({ searchResults: result.data });
  },
  setHunkDecision: async (patchSetId, hunkId, decision) => {
    const result = await window.digitalLife.patch.setHunkDecision({ patchSetId, hunkId, decision });
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
      openTabs: (result.data.repairPatchSet ?? result.data.patchSet).filePatches.map(mapPatchToEditorTab)
    });
    const detail = get().activeSessionId ? await window.digitalLife.conversation.getSession(get().activeSessionId!) : undefined;
    if (detail?.ok && detail.data && get().activeSessionId) {
      set((state) => ({
        sessionDetails: { ...state.sessionDetails, [get().activeSessionId!]: detail.data! }
      }));
    }
    const filePath = (result.data.repairPatchSet ?? result.data.patchSet).filePatches[0]?.relativePath;
    if (filePath) {
      await get().openFile(filePath);
    }
    await get().refreshTaskCenter();
  },
  rollbackPatchSet: async (patchSetId: string) => {
    const result = await window.digitalLife.patch.rollbackPatchSet(patchSetId);
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    set({
      activePatchSet: result.data,
      openTabs: result.data.filePatches.map(mapPatchToEditorTab)
    });
    const filePath = result.data.filePatches[0]?.relativePath;
    if (filePath) {
      await get().openFile(filePath);
    }
    await get().refreshTaskCenter();
  },
  refreshTaskCenter: async () => {
    const result = await window.digitalLife.task.getSnapshot();
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    set({ taskCenter: result.data });
  },
  decideApproval: async (approvalId, decision) => {
    const result = await window.digitalLife.task.decideApproval({ approvalId, decision });
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    set({ taskCenter: result.data });
  },
  markExternalFileChange: ({ path, lastModifiedAt }) => {
    const selected = normalizeWorkspaceRelativePath(get().selectedFilePath ?? "");
    const incoming = normalizeWorkspaceRelativePath(path);
    if (!selected || selected !== incoming) {
      return;
    }
    if (typeof get().fileLastModifiedAt === "number" && get().fileLastModifiedAt === lastModifiedAt) {
      return;
    }
    set((state) => {
      const nextDirty = [...new Set([...state.dirtyEditorPaths, incoming])];
      void window.digitalLife.workspace.setEditorDirtyPaths(nextDirty);
      return {
        externalFileChange: {
          path,
          lastModifiedAt
        },
        dirtyEditorPaths: nextDirty
      };
    });
  },
  notifyEditorBufferDirty: (relativePath: string, isDirty: boolean) => {
    set((state) => {
      const nextDirty = mergeDirtyEditorPaths(state.dirtyEditorPaths, relativePath, isDirty);
      void window.digitalLife.workspace.setEditorDirtyPaths(nextDirty);
      return { dirtyEditorPaths: nextDirty };
    });
  },
  runCommand: async (command, argsText) => {
    if (!command.trim()) {
      return;
    }
    const args = argsText
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean);
    const result = await window.digitalLife.command.run({
      command: command.trim(),
      args
    });
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    set({ latestCommandRun: result.data });
    await get().refreshTaskCenter();
  },
  runCommandStream: async (command, argsText) => {
    if (!command.trim()) {
      return;
    }
    terminalStreamUnsub?.();
    terminalStreamUnsub = undefined;
    set({ terminalOutput: "", activeTerminalExecutionId: undefined, error: undefined });
    const args = argsText
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean);
    const result = await window.digitalLife.command.runStream({
      command: command.trim(),
      args
    });
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    if (result.data.mode === "waiting-approval") {
      set({
        latestCommandRun: {
          status: "waiting-approval",
          taskId: result.data.taskId,
          request: result.data.request,
          approvalRequest: result.data.approvalRequest
        }
      });
      await get().refreshTaskCenter();
      return;
    }
    const { executionId } = result.data;
    set({ activeTerminalExecutionId: executionId });
    terminalStreamUnsub = window.digitalLife.subscribeTerminalStream((event) => {
      if (event.v !== 1 || event.executionId !== executionId) {
        return;
      }
      if (event.type === "stdout" || event.type === "stderr") {
        set((state) => ({
          terminalOutput: state.terminalOutput + event.text
        }));
        return;
      }
      if (event.type === "error") {
        set((state) => ({
          terminalOutput: `${state.terminalOutput}\n[error] ${event.message}\n`
        }));
      }
      if (event.type === "done") {
        terminalStreamUnsub?.();
        terminalStreamUnsub = undefined;
        set((state) => ({
          activeTerminalExecutionId: undefined,
          terminalOutput: `${state.terminalOutput}\n[exit ${event.exitCode ?? "null"}] ${event.summary}\n`
        }));
        void get().refreshTaskCenter();
      }
    });
  },
  stopCommandStream: async () => {
    const id = get().activeTerminalExecutionId;
    if (!id) {
      return;
    }
    const result = await window.digitalLife.command.stopStream(id);
    if (!result.ok) {
      set({ error: result.error.message });
    }
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
      resolvedTheme: result.data.config.resolvedTheme
    });
    themeController.hydrate();
    set((state) => ({
      appInfo: result.data,
      sessions: state.sessions
    }));
    if (patch.modelPreferences) {
      await get().refreshModelHealth();
    }
  },
  setLeftSidebarVisible: (visible) => set({ leftSidebarVisible: visible }),
  setRightPanelVisible: (visible) => set({ rightPanelVisible: visible }),
  setActiveRightTool: (tool) => set({ activeRightTool: tool }),
  setCurrentModel: (model) => set({ currentModel: model }),
  setComposerMessage: (message) => set({ composerMessage: message }),
  toggleLeftSidebar: () => set((s) => ({ leftSidebarVisible: !s.leftSidebarVisible })),
  toggleRightSidebar: () => set((s) => ({ rightPanelVisible: !s.rightPanelVisible })),
  fetchIndexStatus: async () => {
    const result = await window.digitalLife.retrieval.getStatus();
    if (result.ok && result.data) {
      const snap = result.data;
      const stateMap: Record<string, IndexingState> = {
        idle: "idle", running: "indexing", completed: "indexed", failed: "error"
      };
      const status: IndexingStatus = {
        state: stateMap[snap.status] ?? "idle",
        scannedFiles: snap.scannedFiles,
        totalFiles: snap.scannedFiles,
        excludedFiles: snap.scannedFiles - snap.indexedTextFiles,
        lastIndexedAt: snap.completedAt,
        error: snap.lastError
      };
      set({ indexingStatus: status });
    }
  },
  fetchRepoMap: async () => {
    const result = await window.digitalLife.retrieval.getRepoMap();
    if (result.ok) {
      set({ repoMap: result.data });
    }
  },
  fetchAuditEntries: async (limit?: number) => {
    const result = await window.digitalLife.task.listAuditEntries(limit);
    if (result.ok) {
      set({ auditEntries: result.data });
    }
  },
  fetchCommandHistory: async () => {
    const result = await window.digitalLife.command.listRecent(20);
    if (result.ok) {
      set({ commandHistory: result.data.map((item: { command: string; args: string[] }) => `${item.command} ${item.args.join(" ")}`.trim()) });
    }
  },
  fetchGitStatus: async () => {
    const result = await window.digitalLife.workspace.getGitStatus();
    if (result.ok) {
      set({ gitSnapshot: result.data });
    }
  },
  acceptAllHunks: async () => {
    const patchSet = get().activePatchSet;
    if (!patchSet) return;
    for (const filePatch of patchSet.filePatches) {
      for (const hunk of filePatch.hunks) {
        if (hunk.decision !== "accepted") {
          await get().setHunkDecision(patchSet.id, hunk.id, "accepted");
        }
      }
    }
  },
  rejectAllHunks: async () => {
    const patchSet = get().activePatchSet;
    if (!patchSet) return;
    for (const filePatch of patchSet.filePatches) {
      for (const hunk of filePatch.hunks) {
        if (hunk.decision !== "rejected") {
          await get().setHunkDecision(patchSet.id, hunk.id, "rejected");
        }
      }
    }
  },
  restoreCheckpoint: async (_checkpointId: string) => {
    // Will be implemented when checkpoint IPC is available
  }
}));
