import type { DigitalLifeBridge } from "../../shared/ipc";
import type {
  AgentRunDetail,
  AppInfo,
  CommandRunResult,
  ConversationDetail,
  ConversationMessageRecord,
  ConversationSendResult,
  ConversationSessionRecord,
  FileOutlineItem,
  ModelGatewayHealthSnapshot,
  PatchApplicationResult,
  PatchSet,
  WorkspaceMeta,
  WorkspaceSearchHit
} from "@ai-digital-life/kernel";

const now = Date.now();

const workspaceRoot = "E:/mock/ai-digital-life";

const documents = new Map<string, string>([
  [
    "apps/desktop/renderer/src/main.tsx",
    `export function App() {\n  return <main>Hello AI Digital Life</main>;\n}\n`
  ],
  [
    "packages/kernel/src/index.ts",
    `export interface ExampleType {\n  id: string;\n}\n`
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
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now
  }
];

const messagesBySession = new Map<string, ConversationMessageRecord[]>([
  [
    sessions[0].id,
    [
      {
        id: "message-welcome",
        sessionId: sessions[0].id,
        role: "assistant",
        content: "欢迎进入第二阶段工作区主界面。",
        blocks: [
          {
            id: "block-welcome",
            type: "final-summary",
            summary: "这里展示单 Agent 的计划、补丁预览和文件理解流。"
          }
        ],
        createdAt: now
      }
    ]
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
          modelId: "deepseek-chat"
        },
        minimax: {
          enabled: true,
          priority: 3,
          modelId: "MiniMax-M2.5"
        }
      }
    }
  },
  currentWorkspace: {
    id: "workspace-mock-1",
    path: workspaceRoot,
    rootPath: workspaceRoot,
    name: "ai-digital-life",
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
      scope: "main",
      message: "Phase 2 mock shell booted"
    }
  ]
};

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

function createPatchSet(relativePath: string, prompt: string): PatchSet {
  const beforeContent = documents.get(relativePath) ?? "";
  const afterContent = `// AI Digital Life: ${prompt.trim()}\n${beforeContent}`;
  const patchSet: PatchSet = {
    id: `patchset-${Date.now()}`,
    workspaceId: "workspace-mock-1",
    sessionId: sessions[0].id,
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
      workspaceId: "workspace-mock-1",
      sessionId,
      prompt: content,
      scenario: "code-edit",
      status: "ready",
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    steps
  };

  activePatchSet = targetPath ? createPatchSet(targetPath, content) : undefined;

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
        summary: "当前为浏览器预览 mock，真实桌面环境会走 Main/Preload/SQLite。"
      }
    ],
    runId: activeRun.run.id,
    createdAt: Date.now()
  };

  const sessionMessages = messagesBySession.get(sessionId) ?? [];
  sessionMessages.push(userMessage, assistantMessage);
  messagesBySession.set(sessionId, sessionMessages);

  return {
    session: ensureSession(sessionId).session,
    userMessage,
    assistantMessage,
    runDetail: activeRun,
    patchSet: activePatchSet
  };
}

export const mockDigitalLifeBridge: DigitalLifeBridge = {
  app: {
    getInfo: async () => ({ ok: true, data: appInfo }),
    getHealth: async () => ({
      ok: true,
      data: {
        timestamp: Date.now(),
        components: [
          { name: "main", status: "healthy", detail: "Main process ready", updatedAt: Date.now() },
          { name: "worker", status: "healthy", detail: "Background worker ready", updatedAt: Date.now() },
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
      if (patch.language) {
        appInfo.config.language = patch.language;
      }
      if (patch.themeMode) {
        appInfo.config.themeMode = patch.themeMode;
        appInfo.config.resolvedTheme = patch.themeMode === "dark" ? "dark" : "light";
      }
      if (patch.modelPreferences) {
        if (patch.modelPreferences.deepseek) {
          appInfo.config.modelPreferences.providers.deepseek = {
            ...appInfo.config.modelPreferences.providers.deepseek,
            ...patch.modelPreferences.deepseek
          };
        }
        if (patch.modelPreferences.minimax) {
          appInfo.config.modelPreferences.providers.minimax = {
            ...appInfo.config.modelPreferences.providers.minimax,
            ...patch.modelPreferences.minimax
          };
        }
      }
      return { ok: true, data: appInfo };
    }
  },
  workspace: {
    listRecent: async () => ({
      ok: true,
      data: [
        {
          id: "workspace-mock-1",
          path: workspaceRoot,
          rootPath: workspaceRoot,
          name: "ai-digital-life",
          lastOpenedAt: now,
          available: true
        }
      ]
    }),
    open: async (workspacePath: string) => ({
      ok: true,
      data: {
        ...(appInfo.currentWorkspace as WorkspaceMeta),
        path: workspacePath,
        rootPath: workspacePath,
        name: workspacePath.split("/").pop() || workspacePath
      }
    }),
    readFile: async (relativePath: string) => ({
      ok: true,
      data: {
        path: relativePath,
        content: documents.get(relativePath) ?? "",
        lastModifiedAt: fileVersions.get(relativePath) ?? Date.now()
      }
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
      const items: FileOutlineItem[] = content
        .split(/\r?\n/)
        .flatMap((lineText, index) => {
          const trimmed = lineText.trim();
          const match =
            trimmed.match(/^(?:export\s+)?function\s+([A-Za-z0-9_]+)/) ??
            trimmed.match(/^(?:export\s+)?interface\s+([A-Za-z0-9_]+)/) ??
            trimmed.match(/^(?:export\s+)?const\s+([A-Za-z0-9_]+)/);
          if (!match) {
            return [];
          }
          return [
            {
              id: `${relativePath}:${index + 1}`,
              label: match[1],
              kind: trimmed.includes("interface") ? "interface" : trimmed.includes("function") ? "function" : "const",
              line: index + 1
            }
          ];
        });
      return { ok: true, data: items };
    },
    onFileChanged: () => () => undefined
  },
  retrieval: {
    getStatus: async () => ({ ok: true, data: undefined })
  },
  conversation: {
    createSession: async (title?: string) => {
      const session: ConversationSessionRecord = {
        id: `conversation-${Date.now()}`,
        workspaceId: "workspace-mock-1",
        title: title || "Single Agent Session",
        status: "active",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastMessageAt: Date.now()
      };
      sessions.unshift(session);
      messagesBySession.set(session.id, []);
      return { ok: true, data: session };
    },
    listSessions: async () => ({ ok: true, data: sessions }),
    getSession: async (sessionId: string) => ({ ok: true, data: ensureSession(sessionId) }),
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
        const sessionMessages = messagesBySession.get(sessions[0].id) ?? [];
        sessionMessages.push({
          id: `message-validation-${Date.now()}`,
          sessionId: sessions[0].id,
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
              workspaceId: "workspace-mock-1",
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
          workspaceId: "workspace-mock-1",
          profile: input.command.includes("install") ? "install" : "custom",
          command: input.command,
          args: input.args,
          shell: input.shell ?? false,
          riskLevel: input.command.includes("install") ? "high" : "medium",
          createdAt: Date.now()
        }
      } satisfies CommandRunResult
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
    })
  }
};

export function setupMockBridge(): void {
  if (typeof window !== "undefined" && !window.digitalLife) {
    (window as unknown as { digitalLife: DigitalLifeBridge }).digitalLife = mockDigitalLifeBridge;
  }
}
