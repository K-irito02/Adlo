import type { DigitalLifeBridge } from "./shared/ipc";
import type {
  AgentRunDetail,
  AppInfo,
  AuditEntry,
  CommandRequest,
  CommandRunResult,
  ConversationDetail,
  ConversationMessageRecord,
  ConversationSendResult,
  ConversationSessionRecord,
  FileOutlineItem,
  GitBranchSummary,
  GitSnapshot,
  ModelGatewayHealthSnapshot,
  PatchApplicationResult,
  PatchSet,
  RepoMapNode,
  RecentWorkspaceEntry,
  WorkspaceChangePreview,
  WorkspaceMeta,
  WorkspaceGitBranchChangeResult,
  WorkspaceGitBranchCreateInput,
  WorkspaceGitBranchSwitchInput,
  WorkspaceSearchHit
} from "@ai-digital-life/kernel";
import { GLOBAL_WORKSPACE_ID } from "./app/workspaceScope";
import { buildOutlineFromContent } from "./shared/outline";

const now = Date.now();

let workspaceRoot =
  (import.meta.env.VITE_ADL_DEFAULT_WORKSPACE_PATH as string | undefined)?.trim() || "E:/OnlineEditing";

function workspaceNameFromPath(value: string): string {
  const normalized = value.replace(/\\/g, "/").replace(/\/+$/g, "");
  return normalized.split("/").pop() || normalized || "workspace";
}

function buildWorkspaceTreeFromPaths(paths: string[], directoryPaths: string[] = []) {
  type Node = { path: string; name: string; kind: "file" | "directory"; children: Node[] };
  const rootNodes: Node[] = [];
  const dirs = new Map<string, Node>();

  function ensureDir(pathValue: string): Node {
    const normalized = pathValue.replace(/\\/g, "/").replace(/^\/+/g, "").replace(/\/+$/g, "");
    const cached = dirs.get(normalized);
    if (cached) return cached;
    const name = normalized.split("/").pop() || normalized;
    const node: Node = { path: normalized, name, kind: "directory", children: [] };
    dirs.set(normalized, node);
    const parent = normalized.includes("/") ? normalized.slice(0, normalized.lastIndexOf("/")) : "";
    if (parent) {
      ensureDir(parent).children.push(node);
    } else {
      rootNodes.push(node);
    }
    return node;
  }

  for (const raw of directoryPaths) {
    const normalized = raw.replace(/\\/g, "/").replace(/^\/+/g, "").replace(/\/+$/g, "");
    if (!normalized) continue;
    ensureDir(normalized);
  }

  for (const raw of paths) {
    const normalized = raw.replace(/\\/g, "/").replace(/^\/+/g, "").replace(/\/+$/g, "");
    if (!normalized) continue;
    const parent = normalized.includes("/") ? normalized.slice(0, normalized.lastIndexOf("/")) : "";
    const name = normalized.split("/").pop() || normalized;
    const fileNode: Node = { path: normalized, name, kind: "file", children: [] };
    if (parent) {
      ensureDir(parent).children.push(fileNode);
    } else {
      rootNodes.push(fileNode);
    }
  }

  function sort(nodes: Node[]) {
    nodes.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
    nodes.forEach((node) => node.children.length && sort(node.children));
  }
  sort(rootNodes);
  return rootNodes;
}

const emptyDirectories = new Set<string>();

function buildResumeHtml(): string {
  const lines: string[] = ["<!DOCTYPE html>", "<html lang='en'>", "<head>", "  <meta charset='UTF-8'>", "  <title>Resume</title>", "  <style>"];
  for (let i = 0; i < 50; i++) {
    lines.push("    .section-" + i + " { margin: " + i + "px; padding: " + (i * 2) + "px; }");
  }
  lines.push("  </style>", "</head>", "<body>");
  for (let i = 0; i < 500; i++) {
    lines.push("  <div class='section-" + (i % 50) + "'>");
    lines.push("    <h2>Section " + i + "</h2>");
    lines.push("    <p>Content for section " + i + ". This is sample text for testing minimap diff colors.</p>");
    lines.push("    <ul>");
    lines.push("      <li>Item 1 of section " + i + "</li>");
    lines.push("      <li>Item 2 of section " + i + "</li>");
    lines.push("    </ul>");
    lines.push("  </div>");
  }
  lines.push("</body>", "</html>");
  return lines.join("\n");
}

function buildResumeHtmlModified(): string {
  const lines: string[] = ["<!DOCTYPE html>", "<html lang='en'>", "<head>", "  <meta charset='UTF-8'>", "  <title>Resume Updated</title>", "  <style>"];
  for (let i = 0; i < 50; i++) {
    lines.push("    .section-" + i + " { margin: " + i + "px; padding: " + (i * 2) + "px; }");
  }
  lines.push("  </style>", "</head>", "<body>");
  for (let i = 0; i < 500; i++) {
    if (i >= 1460 && i <= 1480) {
      lines.push("  <div class='section-" + (i % 50) + " updated'>");
      lines.push("    <h2>Section " + i + " - MODIFIED</h2>");
      lines.push("    <p>Updated content for section " + i + ". This line was changed.</p>");
      lines.push("    <p>New line added in section " + i + ".</p>");
      lines.push("  </div>");
    } else if (i === 200) {
      continue;
    } else {
      lines.push("  <div class='section-" + (i % 50) + "'>");
      lines.push("    <h2>Section " + i + "</h2>");
      lines.push("    <p>Content for section " + i + ". This is sample text for testing minimap diff colors.</p>");
      lines.push("    <ul>");
      lines.push("      <li>Item 1 of section " + i + "</li>");
      lines.push("      <li>Item 2 of section " + i + "</li>");
      lines.push("    </ul>");
      lines.push("  </div>");
    }
  }
  lines.push("</body>", "</html>");
  return lines.join("\n");
}

const documents = new Map<string, string>([
  [
    "frontend/src/main.tsx",
    `export function App() {\n  return <main>Hello AI Digital Life</main>;\n}\n`
  ],
  [
    "frontend/src/shared/ipc.ts",
    `export interface ExampleType {\n  id: string;\n}\n`
  ],
  [
    "Resume/index.html",
    buildResumeHtml()
  ]
]);

let activePatchSet: PatchSet | undefined;
let activeRun: AgentRunDetail | undefined;
const fileVersions = new Map<string, number>(
  Array.from(documents.keys()).map((filePath, index) => [filePath, now + index])
);

const sessions: ConversationSessionRecord[] = [
  {
    id: "conversation-mock-1",
    workspaceId: "workspace-mock-1",
    title: "Single Agent Session",
    status: "active",
    isPinned: false,
    pinnedOrder: 0,
    unpinnedOrder: 0,
    manualUnread: false,
    lastReadAt: now,
    archivedAt: undefined,
    titleUpdatedAt: now,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now
  }
];

const messagesBySession = new Map<string, ConversationMessageRecord[]>([
  [
    sessions[0].id,
    []
  ]
]);

const appInfo: AppInfo = {
  appName: "AI Digital Life",
  version: "0.1.0",
  config: {
    language: "zh-CN" as const,
    themeMode: "system" as const,
    resolvedTheme: "light" as const,
    logLevel: "info" as const,
    maxRecentWorkspaces: 10,
    modelPreferences: {
      providers: {
        deepseek: {
          enabled: true,
          priority: 1,
          modelId: "deepseek-v4-pro"
        },
        minimax: {
          enabled: true,
          priority: 2,
          modelId: "MiniMax-M2.7"
        }
      }
    }
  },
  currentWorkspace: {
    id: "workspace-mock-1",
    path: workspaceRoot,
    rootPath: workspaceRoot,
    name: workspaceNameFromPath(workspaceRoot),
    type: "node" as const,
    status: "ready" as const,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now
  },
  recentLogs: [
    {
      timestamp: now,
      level: "info" as const,
      scope: "tauri",
      message: `Preview mode: using mock bridge (no real filesystem). workspace=${workspaceRoot}`
    }
  ]
};

const recentWorkspaces: RecentWorkspaceEntry[] = [
  {
    id: "workspace-mock-1",
    path: workspaceRoot,
    rootPath: workspaceRoot,
    name: "OnlineEditing",
    lastOpenedAt: now,
    isPinned: false,
    pinnedOrder: 0,
    unpinnedOrder: 0,
    removedFromSidebar: false,
    available: true
  }
];

let currentWorkspaceMeta: WorkspaceMeta | undefined = appInfo.currentWorkspace;

function setMockCurrentWorkspace(workspace?: WorkspaceMeta): void {
  currentWorkspaceMeta = workspace;
  appInfo.currentWorkspace = workspace;
}

export function setMockActiveWorkspace(workspace?: WorkspaceMeta): void {
  setMockCurrentWorkspace(workspace);
}

function activeWorkspaceScopeId(): string {
  return currentWorkspaceMeta?.id ?? GLOBAL_WORKSPACE_ID;
}

function emptyGitSnapshot(): GitSnapshot {
  return {
    isRepo: false,
    branch: undefined,
    head: undefined,
    ahead: undefined,
    behind: undefined,
    staged: [],
    unstaged: [],
    untracked: [],
    conflicts: [],
    capturedAt: Date.now()
  };
}

function buildMockChangePreview(relativePath: string): WorkspaceChangePreview {
  const snapshot = currentWorkspaceMeta?.gitSnapshot ?? emptyGitSnapshot();
  const normalizedPath = relativePath.replace(/\\/g, "/");
  const status = snapshot.conflicts.includes(normalizedPath)
    ? "conflicted"
    : snapshot.untracked.includes(normalizedPath)
      ? "untracked"
      : snapshot.unstaged.includes(normalizedPath)
        ? "modified"
        : "staged";
  const currentExists = documents.has(normalizedPath);
  const currentContent = documents.get(normalizedPath) ?? "";
  const baseExists = status !== "untracked";
  let baseContent: string;
  if (normalizedPath === "Resume/index.html") {
    baseContent = buildResumeHtml();
  } else {
    baseContent = baseExists ? `// mock HEAD content for ${normalizedPath}\n` : "";
  }
  const resolvedCurrentContent = normalizedPath === "Resume/index.html" ? buildResumeHtmlModified() : currentContent;
  return {
    path: normalizedPath,
    changeKind: !baseExists ? "added" : !currentExists ? "deleted" : "modified",
    status,
    baseExists,
    currentExists,
    baseContent,
    currentContent: resolvedCurrentContent
  };
}

function ensureRecentWorkspace(meta: WorkspaceMeta): void {
  const existing = recentWorkspaces.find((entry) => entry.path === meta.path);
  if (existing) {
    existing.id = meta.id;
    existing.rootPath = meta.rootPath;
    existing.name = meta.name;
    existing.lastOpenedAt = Date.now();
    existing.available = true;
    existing.removedFromSidebar = false;
    return;
  }
  recentWorkspaces.unshift({
    id: meta.id,
    path: meta.path,
    rootPath: meta.rootPath,
    name: meta.name,
    lastOpenedAt: Date.now(),
    isPinned: false,
    pinnedOrder: 0,
    unpinnedOrder: recentWorkspaces.filter((entry) => !entry.isPinned).length,
    removedFromSidebar: false,
    available: true
  });
}

function buildMockWorkspaceMeta(workspacePath: string): WorkspaceMeta {
  return {
    id: `workspace-mock-${workspaceNameFromPath(workspacePath).toLowerCase()}`,
    path: workspacePath,
    rootPath: workspacePath,
    name: workspaceNameFromPath(workspacePath),
    type: "node",
    status: "ready",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastOpenedAt: Date.now(),
    gitSnapshot: {
      ...emptyGitSnapshot(),
      isRepo: true,
      branch: "main",
      head: "abc1234",
      unstaged: ["Resume/index.html"]
    }
  };
}

function listScopedSessions(): ConversationSessionRecord[] {
  const scopeId = activeWorkspaceScopeId();
  return sessions.filter((session) => session.workspaceId === scopeId);
}

const modelHealth: ModelGatewayHealthSnapshot = {
  checkedAt: now,
  providers: [
    {
      providerId: "deepseek",
      healthy: true,
      detail: "Provider responded successfully."
    },
    {
      providerId: "minimax",
      healthy: true,
      detail: "Provider responded successfully."
    }
  ]
};

function ensureSession(sessionId: string): ConversationDetail {
  const session = sessions.find((item) => item.id === sessionId);
  if (!session) {
    throw new Error("Session not found.");
  }
  return {
    session,
    messages: messagesBySession.get(sessionId) ?? []
  };
}

function createPatchSet(sessionId: string, relativePath: string, prompt: string): PatchSet {
  const beforeContent = documents.get(relativePath) ?? "";
  const afterContent = `// AI Digital Life: ${prompt.trim()}\n${beforeContent}`;
  const workspaceId = activeWorkspaceScopeId();
  const patchSet: PatchSet = {
    id: `patchset-${Date.now()}`,
    workspaceId,
    sessionId,
    runId: activeRun?.run.id,
    title: `Update ${relativePath}`,
    summary: `建议在 ${relativePath} 顶部加入任务说明注释。`,
    status: "ready",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    filePatches: [
      {
        id: `filepatch-${Date.now()}`,
        patchSetId: `patchset-${Date.now()}`,
        relativePath,
        beforeContent,
        afterContent,
        hunks: [
          {
            id: `hunk-${Date.now()}`,
            filePatchId: `filepatch-${Date.now()}`,
            patchSetId: `patchset-${Date.now()}`,
            relativePath,
            oldStart: 1,
            oldLines: beforeContent.split(/\r?\n/).length,
            newStart: 1,
            newLines: afterContent.split(/\r?\n/).length,
            preview: `Add task note to ${relativePath}`,
            beforeText: beforeContent,
            afterText: afterContent,
            decision: "accepted"
          }
        ]
      }
    ]
  };

  patchSet.filePatches[0].patchSetId = patchSet.id;
  patchSet.filePatches[0].hunks[0].patchSetId = patchSet.id;
  patchSet.filePatches[0].hunks[0].filePatchId = patchSet.filePatches[0].id;
  return patchSet;
}

function createSendResult(sessionId: string, content: string): ConversationSendResult {
  const workspaceId = activeWorkspaceScopeId();
  const userMessage: ConversationMessageRecord = {
    id: `message-user-${Date.now()}`,
    sessionId,
    role: "user",
    content,
    blocks: [],
    createdAt: Date.now()
  };
  const targetPath = content.match(/@([A-Za-z0-9_./-]+)/)?.[1];
  const steps: AgentRunDetail["steps"] = [
    {
      id: `step-${Date.now()}-1`,
      runId: `run-${Date.now()}`,
      title: "理解需求",
      detail: "识别目标文件与补丁边界。",
      status: "completed",
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: `step-${Date.now()}-2`,
      runId: `run-${Date.now()}`,
      title: "生成补丁预览",
      detail: "输出单文件单 hunk 预览。",
      status: "completed",
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: `step-${Date.now()}-3`,
      runId: `run-${Date.now()}`,
      title: "等待应用",
      detail: "保持 Patch First，等待显式应用。",
      status: "pending",
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
  ];
  activeRun = {
    run: {
      id: `run-${Date.now()}`,
      workspaceId,
      sessionId,
      prompt: content,
      scenario: "code-edit",
      status: "ready",
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    steps
  };

  activePatchSet = targetPath ? createPatchSet(sessionId, targetPath, content) : undefined;

  const assistantMessage: ConversationMessageRecord = {
    id: `message-assistant-${Date.now()}`,
    sessionId,
    role: "assistant",
    content: targetPath ? `已为 ${targetPath} 生成补丁预览。` : "已生成执行计划。",
    blocks: [
      {
        id: `block-plan-${Date.now()}`,
        type: "plan",
        title: "单 Agent 执行计划",
        items: steps.map((step) => ({
          id: step.id,
          title: step.title,
          detail: step.detail,
          status: step.status
        }))
      },
      ...(activePatchSet
        ? [
            {
              id: `block-patch-${Date.now()}`,
              type: "patch-summary" as const,
              patchSetId: activePatchSet.id,
              summary: activePatchSet.summary,
              fileCount: activePatchSet.filePatches.length,
              hunkCount: activePatchSet.filePatches.reduce((total, filePatch) => total + filePatch.hunks.length, 0)
            }
          ]
        : []),
      {
        id: `block-summary-${Date.now()}`,
        type: "final-summary",
        summary: "当前为浏览器预览 mock，真实桌面环境会走 Tauri Command + Rust/SQLite。"
      }
    ],
    runId: activeRun.run.id,
    createdAt: Date.now()
  };

  const sessionMessages = messagesBySession.get(sessionId) ?? [];
  sessionMessages.push(userMessage, assistantMessage);
  messagesBySession.set(sessionId, sessionMessages);
  const session = sessions.find((candidate) => candidate.id === sessionId);
  if (session) {
    session.updatedAt = assistantMessage.createdAt;
    session.lastMessageAt = assistantMessage.createdAt;
    session.manualUnread = false;
    session.lastReadAt = assistantMessage.createdAt;
  }

  return {
    session: ensureSession(sessionId).session,
    userMessage,
    assistantMessage,
    runDetail: activeRun,
    patchSet: activePatchSet
  };
}

export const mockDigitalLifeBridge: DigitalLifeBridge = {
  subscribeModelStream: () => () => undefined,
  subscribeRunActivity: () => () => undefined,
  subscribeTerminalStream: () => () => undefined,
  window: {
    minimize: async () => {},
    maximize: async () => {},
    close: async () => {},
    isMaximized: async () => false,
    setTitle: async (title: string) => {
      try {
        document.title = title;
      } catch {
        // ignore
      }
    }
  },
  app: {
    getInfo: async () => ({ ok: true, data: { ...appInfo, currentWorkspace: currentWorkspaceMeta } }),
    getHealth: async () => ({
      ok: true,
      data: {
        timestamp: Date.now(),
        components: [
          { name: "main", status: "healthy", detail: "Tauri backend ready", updatedAt: Date.now() },
          { name: "worker", status: "healthy", detail: "Background runtime ready", updatedAt: Date.now() },
          { name: "storage", status: "healthy", detail: "SQLite state ready", updatedAt: Date.now() },
          { name: "recovery", status: "healthy", detail: "No recovery required", updatedAt: Date.now() },
          { name: "migration", status: "healthy", detail: "No migration pending", updatedAt: Date.now() }
        ]
      }
    }),
    getDiagnostics: async () => ({
      ok: true,
      data: {
        lifecycle: {
          currentStartedAt: Date.now() - 60_000,
          lastShutdownWasClean: true,
          recoveredFromCrash: false
        },
        migration: {
          change: "none",
          toVersion: "0.1.0",
          executedScripts: []
        },
        events: {
          emitted: 3,
          byType: {
            "app.initialized": 1,
            "workspace.opened": 1,
            "task.upserted": 1
          }
        },
        recentErrors: []
      }
    }),
    getModelHealth: async () => ({ ok: true, data: modelHealth }),
    updatePreferences: async (patch) => {
      const nextConfig = { ...appInfo.config };
      if (patch.language) {
        nextConfig.language = patch.language;
      }
      if (patch.themeMode) {
        nextConfig.themeMode = patch.themeMode;
        nextConfig.resolvedTheme = patch.themeMode === "dark" ? "dark" : "light";
      }
      if (patch.modelPreferences) {
        const nextProviders = { ...nextConfig.modelPreferences.providers };
        if (patch.modelPreferences.deepseek) {
          nextProviders.deepseek = {
            ...nextProviders.deepseek,
            ...patch.modelPreferences.deepseek
          };
        }
        if (patch.modelPreferences.minimax) {
          nextProviders.minimax = {
            ...nextProviders.minimax,
            ...patch.modelPreferences.minimax
          };
        }
        nextConfig.modelPreferences = {
          ...nextConfig.modelPreferences,
          providers: nextProviders
        };
      }
      appInfo.config = nextConfig;
      return { ok: true, data: { ...appInfo, currentWorkspace: currentWorkspaceMeta } };
    }
  },
  workspace: {
    listRecent: async () => ({ ok: true, data: recentWorkspaces }),
    open: async (workspacePath: string) => ({
      ok: true,
      data: (() => {
        workspaceRoot = workspacePath;
        const next = buildMockWorkspaceMeta(workspacePath);
        ensureRecentWorkspace(next);
        setMockCurrentWorkspace(next);
        appInfo.recentLogs.unshift({
          timestamp: Date.now(),
          level: "info" as const,
          scope: "workspace",
          message: `Preview mode: switched mock workspace to ${workspacePath}`
        });
        return next;
      })()
    }),
    clearCurrent: async () => {
      setMockCurrentWorkspace(undefined);
      return { ok: true, data: true };
    },
    pickDirectory: async () => ({
      ok: false,
      error: { code: "UNSUPPORTED", message: "Directory picker is unavailable in the mock bridge." }
    }),
    pin: async (workspaceId: string) => {
      const entry = recentWorkspaces.find((item) => item.id === workspaceId);
      if (entry) {
        entry.isPinned = true;
      }
      return { ok: true, data: recentWorkspaces };
    },
    unpin: async (workspaceId: string) => {
      const entry = recentWorkspaces.find((item) => item.id === workspaceId);
      if (entry) {
        entry.isPinned = false;
      }
      return { ok: true, data: recentWorkspaces };
    },
    reorder: async () => ({ ok: true, data: recentWorkspaces }),
    removeFromSidebar: async (workspaceId: string) => {
      const entry = recentWorkspaces.find((item) => item.id === workspaceId);
      if (entry) {
        entry.removedFromSidebar = true;
      }
      return { ok: true, data: recentWorkspaces };
    },
    restoreToSidebar: async (workspaceId: string) => {
      const entry = recentWorkspaces.find((item) => item.id === workspaceId);
      if (entry) {
        entry.removedFromSidebar = false;
      }
      return { ok: true, data: recentWorkspaces };
    },
    revealInFileManager: async () => ({ ok: true, data: true }),
    createFile: async (relativePath: string, content = "") => {
      documents.set(relativePath, content);
      fileVersions.set(relativePath, Date.now());
      return {
        ok: true,
        data: {
          path: relativePath,
          content,
          lastModifiedAt: fileVersions.get(relativePath) ?? Date.now()
        }
      };
    },
    createFolder: async (relativePath: string) => {
      emptyDirectories.add(relativePath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""));
      return { ok: true, data: true };
    },
    listTree: async () => ({
      ok: true,
      data: currentWorkspaceMeta ? buildWorkspaceTreeFromPaths(Array.from(documents.keys()), Array.from(emptyDirectories)) : []
    }),
    readFile: async (relativePath: string) => ({
      ok: true,
      data: {
        path: relativePath,
        content: documents.get(relativePath) ?? "",
        lastModifiedAt: fileVersions.get(relativePath) ?? Date.now()
      }
    }),
    getChangePreview: async (relativePath: string) => ({
      ok: true,
      data: buildMockChangePreview(relativePath)
    }),
    search: async (query: string) => {
      const hits: WorkspaceSearchHit[] = Array.from(documents.entries())
        .flatMap(([filePath, content]) =>
          content
            .split(/\r?\n/)
            .map((lineText, index) => ({ filePath, lineText, index }))
            .filter((entry) => entry.lineText.toLowerCase().includes(query.toLowerCase()))
            .map((entry) => ({
              path: entry.filePath,
              line: entry.index + 1,
              preview: entry.lineText.trim()
            }))
        )
        .slice(0, 10);
      return { ok: true, data: hits };
    },
    outline: async (relativePath: string) => {
      const content = documents.get(relativePath) ?? "";
      const items: FileOutlineItem[] = buildOutlineFromContent(content, relativePath);
      return { ok: true, data: items };
    },
    setEditorDirtyPaths: async () => ({ ok: true, data: true }),
    getGitStatus: async () => ({
      ok: true,
      data: currentWorkspaceMeta?.gitSnapshot ?? emptyGitSnapshot()
    }),
    listGitBranches: async () => {
      if (!currentWorkspaceMeta) {
        return { ok: false, error: { code: "NOT_FOUND", message: "active workspace" } };
      }
      const currentBranch = currentWorkspaceMeta.gitSnapshot?.branch ?? "main";
      const branches: GitBranchSummary[] = [
        { name: currentBranch, isCurrent: true },
        { name: "main", isCurrent: currentBranch === "main" },
        { name: "experiment/mock", isCurrent: currentBranch === "experiment/mock" }
      ].filter((branch, index, list) => list.findIndex((item) => item.name === branch.name) === index);
      return { ok: true, data: branches };
    },
    switchGitBranch: async (input: WorkspaceGitBranchSwitchInput) => {
      if (!currentWorkspaceMeta) {
        return { ok: false, error: { code: "NOT_FOUND", message: "active workspace" } };
      }
      const dirty = (currentWorkspaceMeta.gitSnapshot?.staged.length ?? 0) > 0 ||
        (currentWorkspaceMeta.gitSnapshot?.unstaged.length ?? 0) > 0 ||
        (currentWorkspaceMeta.gitSnapshot?.untracked.length ?? 0) > 0;
      if (dirty && !input.allowStash) {
        return {
          ok: false,
          error: { code: "INVALID_INPUT", message: "Dirty worktree requires explicit stash confirmation." }
        };
      }
      const previousBranch = currentWorkspaceMeta.gitSnapshot?.branch ?? "main";
      const gitSnapshot: GitSnapshot = {
        ...(currentWorkspaceMeta.gitSnapshot ?? emptyGitSnapshot()),
        isRepo: true,
        branch: input.branchName,
        staged: [],
        unstaged: [],
        untracked: [],
        conflicts: [],
        capturedAt: Date.now()
      };
      const workspace = { ...currentWorkspaceMeta, gitSnapshot, updatedAt: Date.now(), lastOpenedAt: Date.now() };
      setMockCurrentWorkspace(workspace);
      const result: WorkspaceGitBranchChangeResult = {
        workspace,
        gitSnapshot,
        previousBranch,
        currentBranch: input.branchName,
        stashedChanges: dirty
      };
      return { ok: true, data: result };
    },
    createGitBranch: async (input: WorkspaceGitBranchCreateInput) => {
      if (!currentWorkspaceMeta) {
        return { ok: false, error: { code: "NOT_FOUND", message: "active workspace" } };
      }
      const previousBranch = currentWorkspaceMeta.gitSnapshot?.branch ?? "main";
      const shouldStash =
        Boolean(input.baseBranch && input.baseBranch !== previousBranch) &&
        (((currentWorkspaceMeta.gitSnapshot?.staged.length ?? 0) > 0) ||
          ((currentWorkspaceMeta.gitSnapshot?.unstaged.length ?? 0) > 0) ||
          ((currentWorkspaceMeta.gitSnapshot?.untracked.length ?? 0) > 0));
      if (shouldStash && !input.allowStash) {
        return {
          ok: false,
          error: { code: "INVALID_INPUT", message: "Dirty worktree requires explicit stash confirmation." }
        };
      }
      const gitSnapshot: GitSnapshot = {
        ...(currentWorkspaceMeta.gitSnapshot ?? emptyGitSnapshot()),
        isRepo: true,
        branch: input.branchName,
        staged: [],
        unstaged: [],
        untracked: [],
        conflicts: [],
        capturedAt: Date.now()
      };
      const workspace = { ...currentWorkspaceMeta, gitSnapshot, updatedAt: Date.now(), lastOpenedAt: Date.now() };
      setMockCurrentWorkspace(workspace);
      const result: WorkspaceGitBranchChangeResult = {
        workspace,
        gitSnapshot,
        previousBranch,
        currentBranch: input.branchName,
        stashedChanges: shouldStash
      };
      return { ok: true, data: result };
    },
    onFileChanged: () => () => undefined
  },
  retrieval: {
    getStatus: async () => ({
      ok: true,
      data: currentWorkspaceMeta
        ? {
        workspaceId: currentWorkspaceMeta.id,
        rootPath: currentWorkspaceMeta.rootPath,
        status: "completed" as const,
        scannedFiles: 400,
        indexedTextFiles: 356,
        startedAt: Date.now() - 600_000,
        updatedAt: Date.now() - 300_000,
        completedAt: Date.now() - 300_000,
        topExtensions: [
          { extension: ".ts", count: 120 },
          { extension: ".tsx", count: 80 },
          { extension: ".css", count: 44 },
          { extension: ".md", count: 30 }
        ],
        repoMap: [
          { path: "frontend/src", type: "directory" as const },
          { path: "frontend/src/app", type: "directory" as const },
          { path: "frontend/src/kernel/index.ts", type: "file" as const }
        ]
      }
        : undefined
    }),
    getRepoMap: async () => ({
      ok: true,
      data: [
        {
          path: "frontend",
          name: "frontend",
          kind: "directory",
          fileCount: 66,
          primaryLanguage: "TypeScript",
          children: [
            { path: "frontend/src", name: "src", kind: "directory", fileCount: 60, primaryLanguage: "TypeScript", children: [] }
          ]
        },
        {
          path: "crates",
          name: "crates",
          kind: "directory",
          fileCount: 40,
          primaryLanguage: "Rust",
          children: [
            { path: "crates/kernel", name: "kernel", kind: "directory", fileCount: 5, primaryLanguage: "Rust", children: [] }
          ]
        },
        { path: "docs", name: "docs", kind: "directory", fileCount: 15, children: [] },
        { path: "README.md", name: "README.md", kind: "file", fileCount: 1, children: [] }
      ] satisfies RepoMapNode[]
    }),
    rebuildIndex: async () => ({ ok: true, data: true })
  },
  conversation: {
    createSession: async (title?: string) => {
      const workspaceId = activeWorkspaceScopeId();
      const session: ConversationSessionRecord = {
        id: `conversation-${Date.now()}`,
        workspaceId,
        title: title || "Single Agent Session",
        status: "active",
        isPinned: false,
        pinnedOrder: 0,
        unpinnedOrder: sessions.filter((candidate) => !candidate.isPinned).length,
        manualUnread: false,
        lastReadAt: Date.now(),
        archivedAt: undefined,
        titleUpdatedAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastMessageAt: Date.now()
      };
      sessions.unshift(session);
      messagesBySession.set(session.id, []);
      return { ok: true, data: session };
    },
    listSessions: async () => ({ ok: true, data: listScopedSessions() }),
    getSession: async (sessionId: string) => ({ ok: true, data: ensureSession(sessionId) }),
    renameSession: async ({ sessionId, title }) => {
      const session = sessions.find((candidate) => candidate.id === sessionId)!;
      session.title = title;
      session.titleUpdatedAt = Date.now();
      return { ok: true, data: session };
    },
    pinSession: async (sessionId: string) => {
      const session = sessions.find((candidate) => candidate.id === sessionId)!;
      session.isPinned = true;
      return { ok: true, data: session };
    },
    unpinSession: async (sessionId: string) => {
      const session = sessions.find((candidate) => candidate.id === sessionId)!;
      session.isPinned = false;
      return { ok: true, data: session };
    },
    reorderSessions: async () => ({ ok: true, data: sessions }),
    markSessionRead: async ({ sessionId }) => {
      const session = sessions.find((candidate) => candidate.id === sessionId)!;
      session.manualUnread = false;
      session.lastReadAt = Date.now();
      return { ok: true, data: session };
    },
    markSessionUnread: async (sessionId: string) => {
      const session = sessions.find((candidate) => candidate.id === sessionId)!;
      session.manualUnread = true;
      return { ok: true, data: session };
    },
    archiveSession: async (sessionId: string) => {
      const session = sessions.find((candidate) => candidate.id === sessionId)!;
      session.status = "archived";
      session.archivedAt = Date.now();
      return { ok: true, data: session };
    },
    archiveAllInWorkspace: async () => {
      for (const session of listScopedSessions()) {
        session.status = "archived";
        session.archivedAt = Date.now();
      }
      return { ok: true, data: listScopedSessions() };
    },
    deleteSession: async (sessionId: string) => {
      const index = sessions.findIndex((candidate) => candidate.id === sessionId);
      if (index >= 0) {
        sessions.splice(index, 1);
        messagesBySession.delete(sessionId);
      }
      return { ok: true, data: true };
    },
    sendMessage: async ({ sessionId, content }) => ({ ok: true, data: createSendResult(sessionId, content) }),
    cancelMessage: async () => ({ ok: true, data: activeRun })
  },
  agent: {
    startRun: async ({ sessionId, prompt }) => ({ ok: true, data: createSendResult(sessionId, prompt) }),
    getRun: async () => ({ ok: true, data: activeRun }),
    retryRun: async () => ({ ok: true, data: activeRun }),
    abortRun: async () => ({ ok: true, data: activeRun })
  },
  patch: {
    getPatchSet: async () => ({ ok: true, data: activePatchSet }),
    setHunkDecision: async ({ hunkId, decision }) => {
      if (activePatchSet) {
        activePatchSet = {
          ...activePatchSet,
          updatedAt: Date.now(),
          filePatches: activePatchSet.filePatches.map((filePatch) => ({
            ...filePatch,
            hunks: filePatch.hunks.map((hunk) => (hunk.id === hunkId ? { ...hunk, decision } : hunk))
          }))
        };
      }
      return { ok: true, data: activePatchSet as PatchSet };
    },
    applyPatchSet: async () => {
      if (activePatchSet) {
        const filePatch = activePatchSet.filePatches[0];
        documents.set(filePatch.relativePath, filePatch.afterContent);
        activePatchSet = {
          ...activePatchSet,
          status: "applied",
          updatedAt: Date.now()
        };
        const targetSessionId = activePatchSet.sessionId;
        const sessionMessages = messagesBySession.get(targetSessionId) ?? [];
        sessionMessages.push({
          id: `message-validation-${Date.now()}`,
          sessionId: targetSessionId,
          role: "assistant",
          content: "Patch applied and validation completed.",
          blocks: [
            {
              id: `block-tool-${Date.now()}`,
              type: "tool-call",
              toolName: "terminal.run",
              summary: "npm run test",
              status: "completed"
            },
            {
              id: `block-validation-${Date.now()}`,
              type: "validation-result",
              summary: "Validation command completed successfully.",
              status: "passed",
              diagnostics: []
            },
            {
              id: `block-final-${Date.now()}`,
              type: "final-summary",
              summary: "补丁已应用并完成验证。"
            }
          ],
          runId: activeRun?.run.id,
          createdAt: Date.now()
        });
        messagesBySession.set(sessions[0].id, sessionMessages);
      }
      return {
        ok: true,
        data: {
          patchSet: activePatchSet as PatchSet,
          validation: {
            id: `validation-${Date.now()}`,
            workspaceId: "workspace-mock-1",
            runId: activeRun?.run.id,
            patchSetId: activePatchSet?.id,
            status: "passed",
            summary: "Validation command completed successfully.",
            diagnostics: [],
            createdAt: Date.now()
          },
          commandResult: {
            request: {
              id: `command-${Date.now()}`,
              workspaceId: activeWorkspaceScopeId(),
              runId: activeRun?.run.id,
              profile: "test",
              command: "npm",
              args: ["run", "test"],
              shell: false,
              riskLevel: "low",
              createdAt: Date.now()
            },
            exitCode: 0,
            stdout: "tests passed",
            stderr: "",
            summary: "tests passed",
            success: true,
            startedAt: Date.now() - 500,
            completedAt: Date.now()
          },
          rolledBack: false
        } satisfies PatchApplicationResult
      };
    },
    rollbackPatchSet: async () => {
      if (activePatchSet) {
        const filePatch = activePatchSet.filePatches[0];
        documents.set(filePatch.relativePath, filePatch.beforeContent);
        activePatchSet = {
          ...activePatchSet,
          status: "rolled-back",
          updatedAt: Date.now()
        };
      }
      return { ok: true, data: activePatchSet as PatchSet };
    }
  },
  command: {
    getProfiles: async () => ({
      ok: true,
      data: [
        { id: "build", label: "Build" },
        { id: "test", label: "Test" },
        { id: "lint", label: "Lint" }
      ]
    }),
    run: async (input) => ({
      ok: true,
      data: {
        status: input.command.includes("install") ? "waiting-approval" : "completed",
        taskId: `task-command-${Date.now()}`,
        request: {
          id: `command-${Date.now()}`,
          workspaceId: activeWorkspaceScopeId(),
          profile: input.command.includes("install") ? "install" : "custom",
          command: input.command,
          args: input.args,
          shell: input.shell ?? false,
          riskLevel: input.command.includes("install") ? "high" : "medium",
          createdAt: Date.now()
        }
      } satisfies CommandRunResult
    }),
    runStream: async (input) => {
      if (input.command.includes("install")) {
        return {
          ok: true,
          data: {
            mode: "waiting-approval" as const,
            taskId: `task-stream-${Date.now()}`,
            request: {
              id: `command-${Date.now()}`,
              workspaceId: activeWorkspaceScopeId(),
              profile: "install",
              command: input.command,
              args: input.args,
              shell: input.shell ?? false,
              riskLevel: "high" as const,
              createdAt: Date.now()
            },
            approvalRequest: {
              id: "approval-stream-mock",
              taskId: "task-stream",
              title: "command.install",
              description: "Install requires approval.",
              riskLevel: "high" as const,
              impact: [],
              reversible: true,
              createdAt: Date.now()
            }
          }
        };
      }
      const executionId = `termexec-mock-${Date.now()}`;
      return {
        ok: true,
        data: {
          mode: "started" as const,
          executionId,
          taskId: `task-stream-${Date.now()}`,
          request: {
            id: `command-${Date.now()}`,
            workspaceId: activeWorkspaceScopeId(),
            profile: "test",
            command: input.command,
            args: input.args,
            shell: input.shell ?? false,
            riskLevel: "low" as const,
            createdAt: Date.now()
          }
        }
      };
    },
    stopStream: async () => ({ ok: true, data: true }),
    listRecent: async (_limit?: number): Promise<{ ok: true; data: CommandRequest[] }> => ({
      ok: true,
      data: []
    })
  },
  task: {
    getSnapshot: async () => ({
      ok: true,
      data: {
        tasks: [],
        pendingApprovals: [],
        policy: {
          mode: "manual",
          summary: "High-risk actions stay approval-bound.",
          highRiskRules: ["Patch apply remains explicit."]
        }
      }
    }),
    getCheckpointPreview: async () => ({ ok: true, data: undefined }),
    restoreCheckpoint: async () => ({
      ok: true,
      data: {
        tasks: [],
        pendingApprovals: [],
        policy: {
          mode: "manual",
          summary: "High-risk actions stay approval-bound.",
          highRiskRules: ["Patch apply remains explicit."]
        }
      }
    }),
    decideApproval: async () => ({
      ok: true,
      data: {
        tasks: [],
        pendingApprovals: [],
        policy: {
          mode: "manual",
          summary: "High-risk actions stay approval-bound.",
          highRiskRules: ["Patch apply remains explicit."]
        }
      }
    }),
    listAuditEntries: async (_limit?: number): Promise<{ ok: true; data: AuditEntry[] }> => ({
      ok: true,
      data: [
        {
          id: "audit-1",
          timestamp: Date.now() - 60_000,
          operationType: "command",
          summary: "npm run test",
          riskLevel: "low",
          decision: "auto"
        },
        {
          id: "audit-2",
          timestamp: Date.now() - 120_000,
          operationType: "patch-apply",
          summary: "Applied patch to frontend/src/main.tsx",
          riskLevel: "medium",
          decision: "approved"
        },
        {
          id: "audit-3",
          timestamp: Date.now() - 180_000,
          operationType: "file-write",
          summary: "Updated configuration file",
          riskLevel: "low",
          decision: "auto"
        }
      ]
    })
  },
  runActivity: {
    listByRunId: async (_runId: string, _limit?: number) => ({ ok: true, data: [] })
  }
};

export function setupMockBridge(): void {
  if (typeof window !== "undefined" && !window.digitalLife) {
    (window as unknown as { digitalLife: DigitalLifeBridge }).digitalLife = mockDigitalLifeBridge;
  }
}
