import type {
  AppInfo,
  GitSnapshot,
  ModelGatewayHealthSnapshot,
  RecentWorkspaceEntry,
  WorkspaceChangePreview,
  WorkspaceMeta,
} from "@ai-digital-life/kernel";
import { buildResumeHtml, buildResumeHtmlModified } from "../test-fixtures/resume-html";
import { GLOBAL_WORKSPACE_ID } from "@ai-digital-life/kernel";

export const now = Date.now();

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

export const fileVersions = new Map<string, number>(
  Array.from(documents.keys()).map((filePath, index) => [filePath, now + index])
);

export const appInfo: AppInfo = {
  appName: "AI Digital Life",
  version: "0.1.0",
  config: {
    language: "zh-CN" as const,
    themeMode: "system" as const,
    resolvedTheme: "light" as const,
    logLevel: "info" as const,
    terminalLogMode: "overwrite" as const,
    debugLogMode: "overwrite" as const,
    maxRecentWorkspaces: 10,
    modelPreferences: {
      providers: {
        deepseek: {
          enabled: true,
          priority: 1,
          modelId: "deepseek-chat",
          enabledModels: null
        },
        minimax: {
          enabled: true,
          priority: 2,
          modelId: "MiniMax-M2.7",
          enabledModels: null
        }
      }
    },
    keybinds: {},
    fonts: {},
    maxConcurrentWorkspaces: 6,
    workspacePriorityIds: [],
    workspaceDeferredIds: [],
    workspaceNaturalOrder: [],
    browserInactiveTabSuspendMs: 3_600_000,
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
    available: true
  }
];

export let currentWorkspaceMeta: WorkspaceMeta | undefined = appInfo.currentWorkspace;

export type MockBridgeState = {
  appInfo: typeof appInfo;
  currentWorkspaceMeta: typeof currentWorkspaceMeta;
};

export let onMockStateChange: (() => void) | undefined;

export function setOnMockStateChange(callback: (() => void) | undefined): void {
  onMockStateChange = callback;
}

export function setMockCurrentWorkspace(workspace?: WorkspaceMeta): void {
  currentWorkspaceMeta = workspace;
  appInfo.currentWorkspace = workspace;
  onMockStateChange?.();
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