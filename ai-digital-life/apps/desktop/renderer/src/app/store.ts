import { create } from "zustand";
import type {
  AgentRunDetail,
  AppInfo,
  AppPreferencePatch,
  CommandRunResult,
  ConversationDetail,
  ConversationMessageRecord,
  ConversationSessionRecord,
  DiagnosticSummary,
  FileOutlineItem,
  ModelGatewayHealthSnapshot,
  ModelProviderId,
  FilePatch,
  PatchApplicationResult,
  PatchSet,
  TaskCenterSnapshot,
  WorkspaceSearchHit
} from "@ai-digital-life/kernel";
import { copy } from "./copy";
import { MODEL_PROVIDER_IDS } from "./constants";
import { createEditorTab, mapPatchToEditorTab, type EditorTabState } from "./editorTabs";
import { loadConversationState, loadTaskCenterState } from "./loaders";
import { mergeDirtyEditorPaths, normalizeWorkspaceRelativePath } from "./workspacePaths";
import { themeController } from "./theme";

let terminalStreamUnsub: (() => void) | undefined;

export type StoreState = {
  loading: boolean;
  error?: string;
  appInfo?: AppInfo;
  recentWorkspaces: Array<{ path: string; name: string; available: boolean }>;
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
  searchQuery: string;
  searchResults: WorkspaceSearchHit[];
  /** Workspace-relative paths considered dirty vs last loaded disk snapshot (synced to Main for patch guards). */
  dirtyEditorPaths: string[];
  bootstrap: () => Promise<void>;
  openWorkspace: (workspacePath: string) => Promise<void>;
  createSession: () => Promise<void>;
  selectSession: (sessionId: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  cancelActiveStream: () => Promise<void>;
  openFile: (relativePath: string) => Promise<void>;
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
};

export const useAppStore = create<StoreState>((set, get) => ({
  loading: true,
  recentWorkspaces: [],
  sessions: [],
  sessionDetails: {},
  openTabs: [],
  outline: [],
  searchQuery: "",
  searchResults: [],
  streamingAssistantText: "",
  terminalOutput: "",
  dirtyEditorPaths: [],
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
      const conversationState = await loadConversationState();
      const taskCenter = await loadTaskCenterState();
      set({
        ...nextState,
        taskCenter,
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

    set({ ...(nextState as StoreState), dirtyEditorPaths: [] });
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
    const result = await window.digitalLife.conversation.getSession(sessionId);
    if (!result.ok) {
      set({ error: result.error.message });
      return;
    }
    set((state) => ({
      activeSessionId: sessionId,
      sessionDetails: result.data ? { ...state.sessionDetails, [sessionId]: result.data } : state.sessionDetails
    }));
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
  }
}));
