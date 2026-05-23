import type { PtyOutputEvent } from "../shared/ipc";
import { applyPreferencePatch } from "../app/utils/preferencesMerger";
import type {
  AgentRunDetail,
  AppInfo,
  ConversationMessageRecord,
  ConversationSessionRecord,
  FileOutlineItem,
  GitSnapshot,
  ModelGatewayHealthSnapshot,
  PatchSet,
  RecentWorkspaceEntry,
  WorkspaceChangePreview,
  WorkspaceMeta,
  WorkspaceSearchHit
} from "@ai-digital-life/kernel";
import { buildOutlineFromContent } from "../shared/outline";
import { buildResumeHtml, buildResumeHtmlModified } from "../test-fixtures/resume-html";
import { GLOBAL_WORKSPACE_ID } from "../app/workspaceScope";

export const now = Date.now();

export const MAX_PTY_LISTENERS = 32;
export const ptyOutputListeners = new Set<(event: PtyOutputEvent) => void>();
export const activeMockPtySessions = new Map<string, { shell: string; inputBuffer: string }>();

export function emitPtyOutput(sessionId: string, data: string): void {
  const event: PtyOutputEvent = { sessionId, data };
  ptyOutputListeners.forEach((fn) => fn(event));
}

export function getMockPrompt(shell: string): string {
  if (shell === "cmd") return "C:\\Users\\user>";
  if (shell === "bash") return "user@host:~$ ";
  return "PS C:\\Users\\user>";
}

export function executeMockCommand(cmd: string, shell: string): string | undefined {
  if (!cmd) return undefined;
  const parts = cmd.split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);

  if (command === "echo") {
    return args.join(" ");
  }
  if (command === "dir" || command === "ls") {
    return `2026/05/19  10:00    <DIR>          .\r\n2026/05/19  10:00    <DIR>          ..\r\n2026/05/19  10:00             1024  README.md\r\n2026/05/19  10:00            24576  package.json\r\n2026/05/19  10:00              512  index.ts`;
  }
  if (command === "pwd" || command === "cd") {
    return undefined;
  }
  if (command === "date") {
    return new Date().toLocaleString("zh-CN");
  }
  if (command === "whoami") {
    return "user";
  }
  if (command === "help") {
    return `Available commands: echo, dir/ls, pwd, cd, date, whoami, help, cls/clear`;
  }
  return `'${command}' is not recognized as an internal or external command, operable program or batch file.`;
}

export let workspaceRoot =
  (import.meta.env.VITE_ADL_DEFAULT_WORKSPACE_PATH as string | undefined)?.trim() || "E:/OnlineEditing";

export function workspaceNameFromPath(value: string): string {
  const normalized = value.replace(/\\/g, "/").replace(/\/+$/g, "");
  return normalized.split("/").pop() || normalized || "workspace";
}

export function buildWorkspaceTreeFromPaths(paths: string[], directoryPaths: string[] = []) {
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

export const emptyDirectories = new Set<string>();

export const documents = new Map<string, string>([
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

export let activePatchSet: PatchSet | undefined;
export let activeRun: AgentRunDetail | undefined;
export const fileVersions = new Map<string, number>(
  Array.from(documents.keys()).map((filePath, index) => [filePath, now + index])
);

export const sessions: ConversationSessionRecord[] = [
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

export const messagesBySession = new Map<string, ConversationMessageRecord[]>([
  [
    sessions[0].id,
    []
  ]
]);

export const appInfo: AppInfo = {
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

export const recentWorkspaces: RecentWorkspaceEntry[] = [
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
    available: true,
    hiddenFromRightPanels: false
  }
];

export let currentWorkspaceMeta: WorkspaceMeta | undefined = appInfo.currentWorkspace;

export function setMockCurrentWorkspace(workspace?: WorkspaceMeta): void {
  currentWorkspaceMeta = workspace;
  appInfo.currentWorkspace = workspace;
}

export function setActivePatchSet(patchSet: PatchSet | undefined): void {
  activePatchSet = patchSet;
}

export function setActiveRun(run: AgentRunDetail | undefined): void {
  activeRun = run;
}

export function activeWorkspaceScopeId(): string {
  return currentWorkspaceMeta?.id ?? GLOBAL_WORKSPACE_ID;
}

export function emptyGitSnapshot(): GitSnapshot {
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

export function buildMockChangePreview(relativePath: string): WorkspaceChangePreview {
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

export function ensureRecentWorkspace(meta: WorkspaceMeta): void {
  const existing = recentWorkspaces.find((entry) => entry.path === meta.path);
  if (existing) {
    existing.id = meta.id;
    existing.rootPath = meta.rootPath;
    existing.name = meta.name;
    existing.lastOpenedAt = Date.now();
    existing.available = true;
    existing.removedFromSidebar = false;
    existing.hiddenFromRightPanels = false;
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
    available: true,
    hiddenFromRightPanels: false
  });
}

export function buildMockWorkspaceMeta(workspacePath: string): WorkspaceMeta {
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

export function listScopedSessions(): ConversationSessionRecord[] {
  const scopeId = activeWorkspaceScopeId();
  return sessions.filter((session) => session.workspaceId === scopeId);
}

export const modelHealth: ModelGatewayHealthSnapshot = {
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

export function ensureSession(sessionId: string): ConversationSessionRecord {
  const session = sessions.find((item) => item.id === sessionId);
  if (!session) {
    throw new Error("Session not found.");
  }
  return session;
}

export function ensureConversationDetail(sessionId: string): import("@ai-digital-life/kernel").ConversationDetail {
  const session = ensureSession(sessionId);
  return {
    session,
    messages: messagesBySession.get(sessionId) ?? []
  };
}

export function createPatchSet(sessionId: string, relativePath: string, prompt: string): PatchSet {
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

export function createSendResult(
  sessionId: string,
  content: string
): {
  session: ConversationSessionRecord;
  userMessage: ConversationMessageRecord;
  assistantMessage: ConversationMessageRecord;
  patchSet: PatchSet | undefined;
} {
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
  const newRun: AgentRunDetail = {
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
  activeRun = newRun;

  const newPatchSet = targetPath ? createPatchSet(sessionId, targetPath, content) : undefined;
  activePatchSet = newPatchSet;

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
      ...(newPatchSet
        ? [
            {
              id: `block-patch-${Date.now()}`,
              type: "patch-summary" as const,
              patchSetId: newPatchSet.id,
              summary: newPatchSet.summary,
              fileCount: newPatchSet.filePatches.length,
              hunkCount: newPatchSet.filePatches.reduce((total, filePatch) => total + filePatch.hunks.length, 0)
            }
          ]
        : []),
      {
        id: `block-summary-${Date.now()}`,
        type: "final-summary",
        summary: "当前为浏览器预览 mock，真实桌面环境会走 Tauri Command + Rust/SQLite。"
      }
    ],
    runId: newRun.run.id,
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
    session: sessions.find((item) => item.id === sessionId)!,
    userMessage,
    assistantMessage,
    patchSet: newPatchSet
  };
}