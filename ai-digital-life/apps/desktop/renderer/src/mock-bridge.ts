import type { DigitalLifeBridge } from "../../shared/ipc";
import type {
  AppInfo,
  AppPreferencePatch,
  ApprovalRequestSummary,
  HealthSnapshot,
  RecentWorkspaceEntry,
  RetrievalSnapshot,
  TaskCenterSnapshot,
  WorkspaceMeta
} from "@ai-digital-life/kernel";

const now = Date.now();

const mockAppInfo: AppInfo = {
  appName: "AI Digital Life",
  version: "0.1.0",
  config: {
    language: "zh-CN",
    themeMode: "system",
    resolvedTheme: "light",
    logLevel: "info",
    maxRecentWorkspaces: 10
  },
  currentWorkspace: {
    id: "mock-workspace-id",
    path: "/Users/demo/projects/ai-digital-life",
    rootPath: "/Users/demo/projects/ai-digital-life",
    name: "AI Digital Life",
    type: "node",
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    status: "ready"
  },
  recentLogs: [
    { timestamp: now - 60000, level: "info", scope: "kernel", message: "Application started" },
    { timestamp: now - 30000, level: "info", scope: "workspace", message: "Workspace opened: ai-digital-life" },
    { timestamp: now - 10000, level: "debug", scope: "retrieval", message: "Indexing started" }
  ]
};

const mockHealthSnapshot: HealthSnapshot = {
  timestamp: now,
  components: [
    { name: "main", status: "healthy", detail: "Main process running normally", updatedAt: now },
    { name: "worker", status: "healthy", detail: "Worker thread active", updatedAt: now },
    { name: "storage", status: "healthy", detail: "Storage service ready", updatedAt: now }
  ]
};

const mockRecentWorkspaces: RecentWorkspaceEntry[] = [
  {
    id: "ws-1",
    path: "/Users/demo/projects/ai-digital-life",
    rootPath: "/Users/demo/projects/ai-digital-life",
    name: "AI Digital Life",
    lastOpenedAt: now,
    available: true
  },
  {
    id: "ws-2",
    path: "/Users/demo/projects/my-app",
    rootPath: "/Users/demo/projects/my-app",
    name: "My App",
    lastOpenedAt: now - 86400000,
    available: true
  },
  {
    id: "ws-3",
    path: "/Users/demo/projects/old-project",
    rootPath: "/Users/demo/projects/old-project",
    name: "Old Project",
    lastOpenedAt: now - 172800000,
    available: false
  }
];

const mockRetrievalSnapshot: RetrievalSnapshot = {
  workspaceId: "mock-workspace-id",
  rootPath: "/Users/demo/projects/ai-digital-life",
  status: "completed",
  scannedFiles: 156,
  indexedTextFiles: 89,
  startedAt: now - 300000,
  updatedAt: now,
  completedAt: now - 60000,
  topExtensions: [
    { extension: ".ts", count: 45 },
    { extension: ".tsx", count: 23 },
    { extension: ".json", count: 18 },
    { extension: ".md", count: 12 },
    { extension: ".css", count: 8 }
  ],
  repoMap: [
    { path: "src", type: "directory" },
    { path: "src/components", type: "directory" },
    { path: "src/hooks", type: "directory" },
    { path: "src/utils", type: "directory" },
    { path: "src/main.ts", type: "file" },
    { path: "src/App.tsx", type: "file" },
    { path: "packages", type: "directory" },
    { path: "packages/kernel", type: "directory" },
    { path: "packages/storage", type: "directory" },
    { path: "package.json", type: "file" },
    { path: "README.md", type: "file" },
    { path: "tsconfig.json", type: "file" }
  ]
};

const mockApprovalRequests: ApprovalRequestSummary[] = [];

const mockTaskSnapshot: TaskCenterSnapshot = {
  tasks: [
    {
      id: "task-workspace-restore",
      title: "workspace.restore",
      description: "Restore the latest workspace session into the shell.",
      status: "completed",
      riskLevel: "low",
      updatedAt: now,
      detail: "Recovered the latest workspace pointer and hydrated home screen data."
    },
    {
      id: "task-retrieval-index",
      title: "retrieval.index",
      description: "Maintain the local retrieval snapshot for the active workspace.",
      status: "completed",
      riskLevel: "low",
      updatedAt: now,
      detail: "Initial repository scan finished and the repo map is ready."
    }
  ],
  pendingApprovals: mockApprovalRequests,
  policy: {
    mode: "manual",
    summary: "High-risk actions require explicit approval before the shell can continue.",
    highRiskRules: [
      "Destructive file changes require approval.",
      "Force Git actions stay blocked behind governance.",
      "Renderer only shows state and never receives system privileges."
    ]
  }
};

function applyPreferencePatch(patch: AppPreferencePatch): void {
  if (patch.language) {
    mockAppInfo.config.language = patch.language;
  }

  if (patch.themeMode) {
    mockAppInfo.config.themeMode = patch.themeMode;
    mockAppInfo.config.resolvedTheme = patch.themeMode === "dark" ? "dark" : "light";
  }
}

export const mockDigitalLifeBridge: DigitalLifeBridge = {
  app: {
    getInfo: async () => ({ ok: true, data: mockAppInfo }),
    getHealth: async () => ({ ok: true, data: mockHealthSnapshot }),
    updatePreferences: async (patch: AppPreferencePatch) => {
      applyPreferencePatch(patch);
      return { ok: true, data: mockAppInfo };
    }
  },
  workspace: {
    listRecent: async () => ({ ok: true, data: mockRecentWorkspaces }),
    open: async (workspacePath: string): Promise<{ ok: true; data: WorkspaceMeta } | { ok: false; error: { code: string; message: string } }> => {
      const workspaceName = workspacePath.split("/").pop() || workspacePath;
      return {
        ok: true,
        data: {
          id: `ws-${Date.now()}`,
          path: workspacePath,
          rootPath: workspacePath,
          name: workspaceName,
          type: "unknown",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastOpenedAt: Date.now(),
          status: "ready"
        }
      };
    }
  },
  retrieval: {
    getStatus: async () => ({ ok: true, data: mockRetrievalSnapshot })
  },
  task: {
    getSnapshot: async () => ({ ok: true, data: mockTaskSnapshot })
  }
};

export function setupMockBridge(): void {
  if (typeof window !== "undefined" && !window.digitalLife) {
    (window as unknown as { digitalLife: DigitalLifeBridge }).digitalLife = mockDigitalLifeBridge;
    console.log("[Mock] DigitalLife bridge initialized for browser preview");
  }
}
