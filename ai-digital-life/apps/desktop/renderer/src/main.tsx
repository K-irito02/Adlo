import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor, { DiffEditor } from "@monaco-editor/react";
import { createRoot } from "react-dom/client";
import { create } from "zustand";
import type { DigitalLifeBridge } from "../../shared/ipc";
import type {
  AgentRunDetail,
  ApprovalRequestSummary,
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
  WorkspaceMeta,
  WorkspaceSearchHit
} from "@ai-digital-life/kernel";
import { ThemeController } from "./design-system";
import { setupMockBridge } from "./mock-bridge";
import "./styles/index.css";

if (typeof window !== "undefined" && !window.digitalLife) {
  setupMockBridge();
}

declare global {
  interface Window {
    digitalLife: DigitalLifeBridge;
  }
}

const themeController = new ThemeController();

let terminalStreamUnsub: (() => void) | undefined;

const copy = {
  "zh-CN": {
    landingTitle: "AI Digital Life",
    landingBody: "阶段二首个可运行切片：单 Agent 对话、计划、文件理解与 Patch 预览。",
    openWorkspace: "打开工作区",
    workspacePlaceholder: "输入工作区路径",
    sessions: "会话",
    currentTask: "当前运行",
    approvals: "待审批",
    models: "模型状态",
    modelSettings: "模型设置",
    providerEnabled: "启用",
    providerPriority: "优先级",
    providerModelId: "模型 ID",
    refreshModelHealth: "刷新模型健康",
    newSession: "新建会话",
    conversation: "对话流",
    patchPreview: "Patch 预览",
    filePreview: "文件预览",
    search: "检索文件",
    commandRunner: "命令执行",
    send: "发送",
    cancelGenerate: "停止生成",
    noWorkspace: "当前还没有激活工作区。",
    noMessages: "发出第一条消息，开始单 Agent 工作流。",
    noPatch: "暂无补丁预览。",
    applyPatch: "应用补丁",
    rollbackPatch: "回滚补丁",
    accept: "接受",
    reject: "拒绝",
    plan: "计划",
    outline: "Outline",
    searchResults: "检索结果",
    diagnostics: "诊断",
    externalChange: "外部修改",
    theme: "主题",
    language: "语言",
    sessionFallback: "单 Agent 会话",
    sendSelection: "发送选区",
    noSelection: "请先在编辑器中选择代码。",
    noDiagnostics: "当前没有诊断。",
    diffPreview: "差异预览",
    approve: "批准",
    rejectApproval: "拒绝",
    noApprovals: "当前没有待处理审批。",
    approvalPolicy: "审批策略",
    modelUnavailable: "尚未检查模型提供方状态。",
    externalFileChanged: "检测到该文件已被外部程序修改。",
    diffLayoutLabel: "差异视图",
    diffLayoutInline: "内联",
    diffLayoutSideBySide: "并排",
    reloadFile: "重新加载",
    commandBinary: "命令",
    commandArgs: "参数",
    runCommand: "执行命令",
    commandWaitingApproval: "命令已进入审批等待。",
    commandCompleted: "命令执行完成。",
    runStreamCommand: "流式执行",
    stopStreamCommand: "停止",
    terminalOutput: "终端输出"
  },
  "en-US": {
    landingTitle: "AI Digital Life",
    landingBody: "First runnable Phase 2 slice: single-agent chat, plan, file understanding, and patch preview.",
    openWorkspace: "Open Workspace",
    workspacePlaceholder: "Enter workspace path",
    sessions: "Sessions",
    currentTask: "Current Run",
    approvals: "Approvals",
    models: "Models",
    modelSettings: "Model Settings",
    providerEnabled: "Enabled",
    providerPriority: "Priority",
    providerModelId: "Model ID",
    refreshModelHealth: "Refresh Model Health",
    newSession: "New Session",
    conversation: "Conversation",
    patchPreview: "Patch Preview",
    filePreview: "File Preview",
    search: "Search Files",
    commandRunner: "Command Runner",
    send: "Send",
    cancelGenerate: "Stop generating",
    noWorkspace: "No active workspace is attached yet.",
    noMessages: "Send the first message to start the single-agent workflow.",
    noPatch: "No patch preview yet.",
    applyPatch: "Apply Patch",
    rollbackPatch: "Rollback Patch",
    accept: "Accept",
    reject: "Reject",
    plan: "Plan",
    outline: "Outline",
    searchResults: "Search Results",
    diagnostics: "Diagnostics",
    externalChange: "External Change",
    theme: "Theme",
    language: "Language",
    sessionFallback: "Single Agent Session",
    sendSelection: "Send Selection",
    noSelection: "Select code in the editor first.",
    noDiagnostics: "No diagnostics for the current file.",
    diffPreview: "Diff Preview",
    approve: "Approve",
    rejectApproval: "Reject",
    noApprovals: "No pending approvals.",
    approvalPolicy: "Approval Policy",
    modelUnavailable: "Model provider health has not been checked yet.",
    externalFileChanged: "This file changed outside the editor.",
    diffLayoutLabel: "Diff layout",
    diffLayoutInline: "Inline",
    diffLayoutSideBySide: "Side by side",
    reloadFile: "Reload File",
    commandBinary: "Command",
    commandArgs: "Args",
    runCommand: "Run Command",
    commandWaitingApproval: "Command is waiting for approval.",
    commandCompleted: "Command completed.",
    runStreamCommand: "Run (stream)",
    stopStreamCommand: "Stop",
    terminalOutput: "Terminal output"
  }
} as const;

type Locale = keyof typeof copy;

type EditorTabState = {
  id: string;
  path: string;
  title: string;
};

function createEditorTab(filePath: string): EditorTabState {
  const segments = filePath.split(/[\\/]/).filter(Boolean);
  return {
    id: filePath,
    path: filePath,
    title: segments[segments.length - 1] ?? filePath
  };
}

function mapPatchToEditorTab(filePatch: FilePatch): EditorTabState {
  return createEditorTab(filePatch.relativePath);
}

function findFirstDiagnostic(diagnostics: DiagnosticSummary[]) {
  return diagnostics.find((diagnostic) => diagnostic.severity === "error") ?? diagnostics[0];
}

const DIFF_LAYOUT_STORAGE_KEY = "adl-diff-side-by-side";

function readDiffSideBySidePreference(): boolean {
  try {
    return window.localStorage.getItem(DIFF_LAYOUT_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function normalizeWorkspaceRelativePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").trim();
}

function mergeDirtyEditorPaths(current: string[], path: string, isDirty: boolean): string[] {
  const norm = normalizeWorkspaceRelativePath(path);
  if (!norm) {
    return current;
  }
  const set = new Set(current.map((entry) => normalizeWorkspaceRelativePath(entry)));
  if (isDirty) {
    set.add(norm);
  } else {
    set.delete(norm);
  }
  return [...set];
}

function filterDiagnosticsForPath(
  diagnostics: DiagnosticSummary[],
  filePath?: string
) {
  const normalizedTarget = filePath?.replace(/\\/g, "/").toLowerCase();
  if (!normalizedTarget) {
    return diagnostics;
  }

  return diagnostics.filter((diagnostic) => {
    const normalizedDiagnosticPath = diagnostic.path?.replace(/\\/g, "/").toLowerCase();
    return normalizedDiagnosticPath ? normalizedDiagnosticPath.endsWith(normalizedTarget) : false;
  });
}

function detectEditorLanguage(filePath?: string, fallbackLanguage?: string): string {
  if (fallbackLanguage) {
    return fallbackLanguage;
  }

  const extension = filePath?.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
      return "javascript";
    case "json":
      return "json";
    case "md":
      return "markdown";
    case "css":
      return "css";
    case "html":
      return "html";
    case "yml":
    case "yaml":
      return "yaml";
    case "sh":
      return "shell";
    default:
      return "plaintext";
  }
}

type StoreState = {
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

const MODEL_PROVIDER_IDS: ModelProviderId[] = ["deepseek", "minimax"];

async function loadTaskCenterState(): Promise<TaskCenterSnapshot | undefined> {
  const result = await window.digitalLife.task.getSnapshot();
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.data;
}

async function loadConversationState(sessionId?: string): Promise<{
  sessions: ConversationSessionRecord[];
  activeSessionId?: string;
  detail?: ConversationDetail;
}> {
  const sessionsResult = await window.digitalLife.conversation.listSessions();
  if (!sessionsResult.ok) {
    throw new Error(sessionsResult.error.message);
  }

  let activeId = sessionId ?? sessionsResult.data[0]?.id;
  if (!activeId) {
    const created = await window.digitalLife.conversation.createSession();
    if (!created.ok) {
      throw new Error(created.error.message);
    }
    activeId = created.data.id;
  }

  const detailResult = activeId ? await window.digitalLife.conversation.getSession(activeId) : undefined;
  if (detailResult && !detailResult.ok) {
    throw new Error(detailResult.error.message);
  }

  return {
    sessions: sessionsResult.data,
    activeSessionId: activeId,
    detail: detailResult?.data
  };
}

const useAppStore = create<StoreState>((set, get) => ({
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
          .flatMap((message) => message.blocks)
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
    const label = get().appInfo?.config.language === "en-US" ? copy["en-US"].sessionFallback : copy["zh-CN"].sessionFallback;
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

function MessageBlocks({ message }: { message: ConversationMessageRecord }) {
  return (
    <div className="adl-message-blocks">
      {message.blocks.map((block) => {
        if (block.type === "plan") {
          return (
            <section key={block.id} className="adl-block">
              <h4>{block.title}</h4>
              <ul>
                {block.items.map((item) => (
                  <li key={item.id}>
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        }

        if (block.type === "patch-summary") {
          return (
            <section key={block.id} className="adl-block">
              <h4>Patch</h4>
              <p>{block.summary}</p>
              <p>
                {block.fileCount} files / {block.hunkCount} hunks
              </p>
            </section>
          );
        }

        if (block.type === "tool-call") {
          return (
            <section key={block.id} className="adl-block">
              <h4>Tool</h4>
              <p>{block.toolName}</p>
              <p>{block.summary}</p>
              <span>{block.status}</span>
            </section>
          );
        }

        if (block.type === "validation-result") {
          return (
            <section key={block.id} className="adl-block">
              <h4>Validation</h4>
              <p>{block.summary}</p>
              <span>{block.status}</span>
              {block.diagnostics.length ? (
                <ul>
                  {block.diagnostics.map((diagnostic) => (
                    <li key={diagnostic.id}>
                      <strong>{diagnostic.source}</strong>
                      <span>{diagnostic.path ? ` ${diagnostic.path}` : ""}</span>
                      <span>{diagnostic.line ? `:${diagnostic.line}` : ""}</span>
                      <span> {diagnostic.message}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          );
        }

        if (block.type === "final-summary") {
          return (
            <section key={block.id} className="adl-block">
              <p>{block.summary}</p>
            </section>
          );
        }

        if (block.type === "markdown") {
          return (
            <section key={block.id} className="adl-block">
              <p>{block.text}</p>
            </section>
          );
        }

        return null;
      })}
    </div>
  );
}

type MonacoEditorRef = {
  getSelection: () => {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  } | null;
  getModel: () => {
    getValueInRange: (range: {
      startLineNumber: number;
      startColumn: number;
      endLineNumber: number;
      endColumn: number;
    }) => string;
  } | null;
  revealLineInCenter: (lineNumber: number) => void;
};

function buildSelectionPrompt(filePath: string, selection: string): string {
  return `@${filePath}\n\n请基于以下选区继续工作：\n\`\`\`\n${selection}\n\`\`\``;
}

function App() {
  const {
    loading,
    error,
    appInfo,
    recentWorkspaces,
    sessions,
    activeSessionId,
    sessionDetails,
    activeRun,
    activePatchSet,
    latestPatchApplication,
    taskCenter,
    modelHealth,
    latestCommandRun,
    terminalOutput,
    activeTerminalExecutionId,
    openTabs,
    selectedFilePath,
    fileContent,
    fileLastModifiedAt,
    externalFileChange,
    outline,
    searchResults,
    bootstrap,
    openWorkspace,
    createSession,
    selectSession,
    sendMessage,
    cancelActiveStream,
    streamingAssistantText,
    streamingActiveRunId,
    openFile,
    searchFiles,
    setHunkDecision,
    applyPatchSet,
    rollbackPatchSet,
    refreshTaskCenter,
    decideApproval,
    markExternalFileChange,
    notifyEditorBufferDirty,
    runCommand,
    runCommandStream,
    stopCommandStream,
    refreshModelHealth,
    updatePreferences
  } = useAppStore();
  const [workspacePath, setWorkspacePath] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [commandBinary, setCommandBinary] = useState("npm");
  const [commandArgs, setCommandArgs] = useState("run test");
  const [editorHint, setEditorHint] = useState<string>();
  const standardEditorRef = useRef<MonacoEditorRef | null>(null);
  const diffEditorRef = useRef<MonacoEditorRef | null>(null);
  const terminalOutputEndRef = useRef<HTMLDivElement | null>(null);
  const editorDirtyTimerRef = useRef<number>();
  const [diffSideBySide, setDiffSideBySide] = useState(readDiffSideBySidePreference);

  const persistDiffLayout = useCallback((sideBySide: boolean) => {
    setDiffSideBySide(sideBySide);
    try {
      window.localStorage.setItem(DIFF_LAYOUT_STORAGE_KEY, sideBySide ? "1" : "0");
    } catch {
      /* ignore quota / private mode */
    }
  }, []);

  const handleStandardEditorChange = useCallback(
    (value: string | undefined) => {
      const pathAtEdit = selectedFilePath;
      if (!pathAtEdit) {
        return;
      }
      window.clearTimeout(editorDirtyTimerRef.current);
      editorDirtyTimerRef.current = window.setTimeout(() => {
        if (useAppStore.getState().selectedFilePath !== pathAtEdit) {
          return;
        }
        const baseline = useAppStore.getState().fileContent ?? "";
        const dirty = (value ?? "") !== baseline;
        notifyEditorBufferDirty(pathAtEdit, dirty);
      }, 300);
    },
    [notifyEditorBufferDirty, selectedFilePath]
  );

  useEffect(() => {
    return () => {
      window.clearTimeout(editorDirtyTimerRef.current);
    };
  }, [selectedFilePath]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!appInfo) {
      return;
    }
    themeController.setTheme({
      mode: appInfo.config.themeMode,
      resolvedTheme: appInfo.config.resolvedTheme
    });
    themeController.hydrate();
  }, [appInfo]);

  useEffect(() => {
    if (!appInfo?.currentWorkspace) {
      return;
    }
    const timer = window.setInterval(() => {
      void refreshTaskCenter();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [appInfo?.currentWorkspace, refreshTaskCenter]);

  useEffect(() => {
    return window.digitalLife.workspace.onFileChanged((event) => {
      markExternalFileChange(event);
    });
  }, [markExternalFileChange]);

  useEffect(() => {
    if (!terminalOutput) {
      return;
    }
    terminalOutputEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [terminalOutput]);

  const locale = (appInfo?.config.language ?? "zh-CN") as Locale;
  const t = copy[locale];
  const activeDetail = activeSessionId ? sessionDetails[activeSessionId] : undefined;
  const filePatch = useMemo(() => {
    if (!activePatchSet || !selectedFilePath) {
      return activePatchSet?.filePatches[0];
    }
    return activePatchSet.filePatches.find((candidate) => candidate.relativePath === selectedFilePath) ?? activePatchSet.filePatches[0];
  }, [activePatchSet, selectedFilePath]);
  const validation = latestPatchApplication?.validation;
  const selectedDiagnostics = useMemo(
    () => filterDiagnosticsForPath(validation?.diagnostics ?? [], selectedFilePath),
    [selectedFilePath, validation?.diagnostics]
  );
  const activeDiagnostic = useMemo(() => findFirstDiagnostic(selectedDiagnostics), [selectedDiagnostics]);
  const editorLanguage = useMemo(
    () => detectEditorLanguage(selectedFilePath, filePatch?.language),
    [filePatch?.language, selectedFilePath]
  );
  const mergedTabs = useMemo(() => {
    const seen = new Set<string>();
    return [...openTabs, ...(activePatchSet?.filePatches.map(mapPatchToEditorTab) ?? [])].filter((tab) => {
      if (seen.has(tab.path)) {
        return false;
      }
      seen.add(tab.path);
      return true;
    });
  }, [activePatchSet?.filePatches, openTabs]);
  const modelHealthMap = useMemo(
    () =>
      new Map(
        (modelHealth?.providers ?? []).map((provider) => [provider.providerId, provider] satisfies [ModelProviderId, typeof provider])
      ),
    [modelHealth?.providers]
  );

  useEffect(() => {
    if (!activeDiagnostic?.line) {
      return;
    }
    const editor = diffEditorRef.current ?? standardEditorRef.current;
    editor?.revealLineInCenter(activeDiagnostic.line);
  }, [activeDiagnostic]);

  useEffect(() => {
    const editor = standardEditorRef.current as unknown as {
      getModel?: () => unknown;
    } | null;
    const model = editor?.getModel?.();
    const monacoEditor = (window as typeof window & {
      monaco?: {
        editor: {
          setModelMarkers: (model: unknown, owner: string, markers: unknown[]) => void;
          MarkerSeverity: {
            Error: number;
            Warning: number;
            Info: number;
          };
        };
      };
    }).monaco;

    if (!model || !monacoEditor) {
      return;
    }

    monacoEditor.editor.setModelMarkers(
      model,
      "validation",
      selectedDiagnostics.map((diagnostic) => ({
        startLineNumber: diagnostic.line ?? 1,
        startColumn: diagnostic.column ?? 1,
        endLineNumber: diagnostic.line ?? 1,
        endColumn: (diagnostic.column ?? 1) + 1,
        message: diagnostic.message,
        severity:
          diagnostic.severity === "error"
            ? monacoEditor.editor.MarkerSeverity.Error
            : diagnostic.severity === "warning"
              ? monacoEditor.editor.MarkerSeverity.Warning
              : monacoEditor.editor.MarkerSeverity.Info
      }))
    );
  }, [selectedDiagnostics]);

  const sendSelectedCode = async () => {
    const editor = diffEditorRef.current ?? standardEditorRef.current;
    const selection = editor?.getSelection();
    const model = editor?.getModel();
    if (!selection || !model || !selectedFilePath) {
      setEditorHint(t.noSelection);
      return;
    }

    const selectedText = model.getValueInRange(selection).trim();
    if (!selectedText) {
      setEditorHint(t.noSelection);
      return;
    }

    setEditorHint(undefined);
    await sendMessage(buildSelectionPrompt(selectedFilePath, selectedText));
  };

  if (loading) {
    return <main className="phase-two-shell"><section className="card"><p>Loading...</p></section></main>;
  }

  return (
    <main className="phase-two-shell">
      <header className="phase-two-topbar card">
        <div>
          <p className="eyebrow">Phase 2</p>
          <h1>{t.landingTitle}</h1>
          <p className="text-muted">{t.landingBody}</p>
        </div>
        <div className="adl-toolbar">
          <label>
            <span>{t.language}</span>
            <select
              value={appInfo?.config.language ?? "zh-CN"}
              onChange={(event) => void updatePreferences({ language: event.target.value as AppInfo["config"]["language"] })}
            >
              <option value="zh-CN">中文</option>
              <option value="en-US">English</option>
            </select>
          </label>
          <label>
            <span>{t.theme}</span>
            <select
              value={appInfo?.config.themeMode ?? "system"}
              onChange={(event) => void updatePreferences({ themeMode: event.target.value as AppInfo["config"]["themeMode"] })}
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
        </div>
      </header>

      {error ? <section className="card adl-error">{error}</section> : null}

      {!appInfo?.currentWorkspace ? (
        <section className="card adl-landing-card">
          <p>{t.noWorkspace}</p>
          <div className="adl-inline-form">
            <input
              value={workspacePath}
              onChange={(event) => setWorkspacePath(event.target.value)}
              placeholder={t.workspacePlaceholder}
            />
            <button type="button" onClick={() => void openWorkspace(workspacePath)}>
              {t.openWorkspace}
            </button>
          </div>
          <ul className="adl-recent-list">
            {recentWorkspaces.map((workspace) => (
              <li key={workspace.path}>
                <button type="button" onClick={() => void openWorkspace(workspace.path)}>
                  {workspace.name}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="phase-two-columns">
          <aside className="card adl-panel">
            <div className="adl-panel-header">
              <h2>{t.sessions}</h2>
              <button type="button" onClick={() => void createSession()}>
                {t.newSession}
              </button>
            </div>
            <ul className="adl-session-list">
              {sessions.map((session) => (
                <li key={session.id}>
                  <button
                    type="button"
                    className={session.id === activeSessionId ? "is-active" : ""}
                    onClick={() => void selectSession(session.id)}
                  >
                    <strong>{session.title}</strong>
                    <span>{new Date(session.updatedAt).toLocaleString(locale)}</span>
                  </button>
                </li>
              ))}
            </ul>
            <section className="adl-run-card">
              <h3>{t.currentTask}</h3>
              <p>{activeRun?.run.status ?? "-"}</p>
              <p>{activeRun?.run.summary ?? "-"}</p>
            </section>
            <section className="adl-run-card">
              <h3>{t.approvals}</h3>
              <p className="adl-status">{t.approvalPolicy}: {taskCenter?.policy.summary ?? "-"}</p>
              {taskCenter?.pendingApprovals.length ? (
                <ul className="adl-approval-list">
                  {taskCenter.pendingApprovals.map((approval: ApprovalRequestSummary) => (
                    <li key={approval.id} className="adl-approval-card">
                      <strong>{approval.title}</strong>
                      <span>{approval.description}</span>
                      <span className="adl-status">{approval.riskLevel}</span>
                      <div className="adl-hunk-actions">
                        <button type="button" onClick={() => void decideApproval(approval.id, "approved")}>
                          {t.approve}
                        </button>
                        <button type="button" onClick={() => void decideApproval(approval.id, "rejected")}>
                          {t.rejectApproval}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted">{t.noApprovals}</p>
              )}
            </section>
            <section className="adl-run-card">
              <h3>{t.models}</h3>
              <button type="button" onClick={() => void refreshModelHealth()}>
                {t.refreshModelHealth}
              </button>
              {modelHealth?.providers.length ? (
                <ul className="adl-model-health-list">
                  {modelHealth.providers.map((provider) => (
                    <li key={provider.providerId} className="adl-model-health-item">
                      <strong>{provider.providerId}</strong>
                      <span className="adl-status">{provider.healthy ? "healthy" : "degraded"}</span>
                      <span>{provider.detail}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted">{t.modelUnavailable}</p>
              )}
              <div className="adl-model-settings">
                <h4>{t.modelSettings}</h4>
                {MODEL_PROVIDER_IDS.map((providerId) => {
                  const providerPreference = appInfo?.config.modelPreferences.providers[providerId];
                  const providerHealth = modelHealthMap.get(providerId);
                  if (!providerPreference) {
                    return null;
                  }

                  return (
                    <section key={providerId} className="adl-model-setting-card">
                      <strong>{providerId}</strong>
                      <label className="adl-setting-row">
                        <span>{t.providerEnabled}</span>
                        <input
                          type="checkbox"
                          checked={providerPreference.enabled}
                          onChange={(event) =>
                            void updatePreferences({
                              modelPreferences: {
                                [providerId]: {
                                  enabled: event.target.checked
                                }
                              }
                            })
                          }
                        />
                      </label>
                      <label className="adl-setting-row">
                        <span>{t.providerPriority}</span>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={providerPreference.priority}
                          onChange={(event) =>
                            void updatePreferences({
                              modelPreferences: {
                                [providerId]: {
                                  priority: Number(event.target.value)
                                }
                              }
                            })
                          }
                        />
                      </label>
                      <label className="adl-setting-row">
                        <span>{t.providerModelId}</span>
                        <input
                          type="text"
                          value={providerPreference.modelId}
                          onChange={(event) =>
                            void updatePreferences({
                              modelPreferences: {
                                [providerId]: {
                                  modelId: event.target.value
                                }
                              }
                            })
                          }
                        />
                      </label>
                      <span className="adl-status">{providerHealth?.detail ?? t.modelUnavailable}</span>
                    </section>
                  );
                })}
              </div>
            </section>
            <section className="adl-run-card">
              <h3>{t.commandRunner}</h3>
              <div className="adl-inline-form">
                <input value={commandBinary} onChange={(event) => setCommandBinary(event.target.value)} placeholder={t.commandBinary} />
              </div>
              <div className="adl-inline-form">
                <input value={commandArgs} onChange={(event) => setCommandArgs(event.target.value)} placeholder={t.commandArgs} />
              </div>
              <div className="adl-inline-actions">
                <button type="button" onClick={() => void runCommand(commandBinary, commandArgs)}>
                  {t.runCommand}
                </button>
                <button type="button" onClick={() => void runCommandStream(commandBinary, commandArgs)}>
                  {t.runStreamCommand}
                </button>
                <button
                  type="button"
                  disabled={!activeTerminalExecutionId}
                  onClick={() => void stopCommandStream()}
                >
                  {t.stopStreamCommand}
                </button>
              </div>
              {latestCommandRun ? (
                <p className="adl-status">
                  {latestCommandRun.status === "waiting-approval" ? t.commandWaitingApproval : t.commandCompleted}
                </p>
              ) : null}
              <div className="adl-terminal-panel">
                <h4 className="adl-terminal-panel__title">{t.terminalOutput}</h4>
                <pre className="adl-terminal-panel__output" data-testid="terminal-output">
                  {terminalOutput || "—"}
                </pre>
                <div ref={terminalOutputEndRef} />
              </div>
            </section>
          </aside>

          <section className="card adl-panel adl-conversation-panel">
            <div className="adl-panel-header">
              <h2>{t.conversation}</h2>
            </div>
            <div className="adl-message-stream">
              {activeDetail?.messages.length ? (
                activeDetail.messages.map((messageItem) => (
                  <article key={messageItem.id} className={`adl-message adl-message--${messageItem.role}`}>
                    <header>
                      <strong>{messageItem.role}</strong>
                    </header>
                    <p>{messageItem.content}</p>
                    <MessageBlocks message={messageItem} />
                  </article>
                ))
              ) : (
                <p className="text-muted">{t.noMessages}</p>
              )}
              {streamingAssistantText ? (
                <article className="adl-message adl-message--assistant adl-message--streaming">
                  <header>
                    <strong>assistant</strong>
                    <span className="text-muted"> streaming</span>
                  </header>
                  <p>{streamingAssistantText}</p>
                </article>
              ) : null}
            </div>
            <div className="adl-composer">
              <textarea
                data-testid="composer-input"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="@packages/kernel/src/index.ts 添加阶段二说明"
              />
              <button
                data-testid="composer-send"
                type="button"
                onClick={() => {
                  void sendMessage(message);
                  setMessage("");
                }}
              >
                {t.send}
              </button>
              {streamingActiveRunId ? (
                <button type="button" className="adl-button-secondary" onClick={() => void cancelActiveStream()}>
                  {t.cancelGenerate}
                </button>
              ) : null}
            </div>
          </section>

          <aside className="card adl-panel adl-side-panel">
            <section className="adl-panel-section">
              <div className="adl-panel-header">
                <h2>{t.patchPreview}</h2>
                {activePatchSet ? <span className="adl-status">{activePatchSet.status}</span> : null}
              </div>
              {latestPatchApplication?.validation ? (
                <div className="adl-validation-banner">
                  <strong>{latestPatchApplication.validation.status}</strong>
                  <span>{latestPatchApplication.validation.summary}</span>
                  {latestPatchApplication.rolledBack ? <span>rolled back</span> : null}
                </div>
              ) : null}
              {filePatch ? (
                <div className="adl-patch-card">
                  <button type="button" className="adl-file-chip" onClick={() => void openFile(filePatch.relativePath)}>
                    {filePatch.relativePath}
                  </button>
                  {filePatch.hunks.map((hunk) => (
                    <div key={hunk.id} className="adl-hunk">
                      <p>{hunk.preview}</p>
                      <div className="adl-hunk-actions">
                        <button type="button" onClick={() => void setHunkDecision(activePatchSet!.id, hunk.id, "accepted")}>
                          {t.accept}
                        </button>
                        <button type="button" onClick={() => void setHunkDecision(activePatchSet!.id, hunk.id, "rejected")}>
                          {t.reject}
                        </button>
                      </div>
                      <pre>{hunk.afterText}</pre>
                    </div>
                  ))}
                  <div className="adl-inline-actions">
                    <button data-testid="patch-apply" type="button" onClick={() => void applyPatchSet(activePatchSet!.id)}>
                      {t.applyPatch}
                    </button>
                    <button type="button" onClick={() => void rollbackPatchSet(activePatchSet!.id)}>
                      {t.rollbackPatch}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-muted">{t.noPatch}</p>
              )}
            </section>

            <section className="adl-panel-section">
              <div className="adl-panel-header">
                <h2>{t.search}</h2>
              </div>
              <div className="adl-inline-form">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="query"
                />
                <button type="button" onClick={() => void searchFiles(query)}>
                  Go
                </button>
              </div>
              <h3>{t.searchResults}</h3>
              <ul className="adl-search-results">
                {searchResults.map((result) => (
                  <li key={`${result.path}:${result.line}`}>
                    <button type="button" onClick={() => void openFile(result.path)}>
                      <strong>{result.path}</strong>
                      <span>{result.preview}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <section className="adl-panel-section">
              <div className="adl-panel-header">
                <h2>{t.filePreview}</h2>
                <button type="button" onClick={() => void sendSelectedCode()}>
                  {t.sendSelection}
                </button>
              </div>
              {selectedFilePath ? <p className="adl-file-path">{selectedFilePath}</p> : null}
              {externalFileChange?.path === selectedFilePath ? (
                <div className="adl-validation-banner">
                  <strong>{t.externalChange}</strong>
                  <span>{t.externalFileChanged}</span>
                  <button type="button" onClick={() => void openFile(selectedFilePath!)}>
                    {t.reloadFile}
                  </button>
                </div>
              ) : null}
              {mergedTabs.length ? (
                <div className="adl-editor-tabs">
                  {mergedTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      className={tab.path === selectedFilePath ? "is-active" : ""}
                      onClick={() => void openFile(tab.path)}
                    >
                      {tab.title}
                    </button>
                  ))}
                </div>
              ) : null}
              {editorHint ? <p className="adl-status">{editorHint}</p> : null}
              <div className="adl-editor-shell" data-testid="editor-shell">
                {filePatch && filePatch.relativePath === selectedFilePath ? (
                  <>
                    <p className="adl-status">{t.diffPreview}</p>
                    <div className="adl-diff-layout-toggle" role="group" aria-label={t.diffLayoutLabel}>
                      <button
                        type="button"
                        className={diffSideBySide ? "" : "is-active"}
                        onClick={() => persistDiffLayout(false)}
                      >
                        {t.diffLayoutInline}
                      </button>
                      <button
                        type="button"
                        className={diffSideBySide ? "is-active" : ""}
                        onClick={() => persistDiffLayout(true)}
                      >
                        {t.diffLayoutSideBySide}
                      </button>
                    </div>
                    <DiffEditor
                      height="320px"
                      language={editorLanguage}
                      original={filePatch.beforeContent}
                      modified={filePatch.afterContent}
                      options={{
                        readOnly: true,
                        minimap: { enabled: false },
                        renderSideBySide: diffSideBySide,
                        scrollBeyondLastLine: false
                      }}
                      onMount={(editor) => {
                        diffEditorRef.current = editor as unknown as MonacoEditorRef;
                      }}
                    />
                  </>
                ) : (
                  <Editor
                    height="320px"
                    language={editorLanguage}
                    value={fileContent ?? ""}
                    options={{
                      readOnly: false,
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false
                    }}
                    onChange={(value) => handleStandardEditorChange(value)}
                    onMount={(editor, monaco) => {
                      standardEditorRef.current = editor as unknown as MonacoEditorRef;
                      (window as typeof window & { monaco?: typeof monaco }).monaco = monaco;
                    }}
                  />
                )}
              </div>
              <div className="adl-diagnostics">
                <h3>{t.diagnostics}</h3>
                {selectedDiagnostics.length ? (
                  <ul className="adl-diagnostic-list">
                    {selectedDiagnostics.map((diagnostic) => (
                      <li key={diagnostic.id}>
                        <button
                          type="button"
                          onClick={() => {
                            const editor = diffEditorRef.current ?? standardEditorRef.current;
                            if (diagnostic.line) {
                              editor?.revealLineInCenter(diagnostic.line);
                            }
                          }}
                        >
                          <strong>{diagnostic.source}</strong>
                          <span>{diagnostic.message}</span>
                          <span>
                            {diagnostic.path ?? selectedFilePath}
                            {diagnostic.line ? `:${diagnostic.line}` : ""}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted">{t.noDiagnostics}</p>
                )}
              </div>
              <h3>{t.outline}</h3>
              <ul className="adl-outline-list">
                {outline.map((item) => (
                  <li key={item.id}>
                    <span>{item.kind}</span>
                    <strong>{item.label}</strong>
                    <span>L{item.line}</span>
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </section>
      )}
    </main>
  );
}

const container = document.getElementById("app");
if (!container) {
  throw new Error("App root not found.");
}

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
