// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";

class ResizeObserverPolyfill {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof window.ResizeObserver === "undefined") {
  window.ResizeObserver = ResizeObserverPolyfill as unknown as typeof ResizeObserver;
}

vi.mock("@monaco-editor/react", () => ({
  __esModule: true,
  default: ({ value }: { value?: string }) => React.createElement("div", { "data-testid": "monaco-editor" }, value ?? ""),
  DiffEditor: ({ original, modified }: { original?: string; modified?: string }) =>
    React.createElement("div", { "data-testid": "monaco-diff-editor" }, `${original ?? ""}\n${modified ?? ""}`)
}));

describe("desktop renderer phase 2 workspace shell", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
  });

  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("renders the workspace shell and drives the conversation to patch flow", async () => {
    const now = Date.now();
    const sessionId = "conversation-1";
    const patchSetId = "patchset-1";
    let pendingApprovals = [
      {
        id: "approval-1",
        taskId: "task-1",
        title: "dirty-worktree.guard",
        description: "Resolve conflicts before risky actions continue.",
        riskLevel: "high" as const,
        impact: ["Conflicts can invalidate patch application."],
        reversible: true,
        createdAt: now
      }
    ];
    let conversationDetail = {
      session: {
        id: sessionId,
        workspaceId: "workspace-1",
        title: "Single Agent Session",
        status: "active" as const,
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
      },
      messages: [
        {
          id: "message-assistant-1",
          sessionId,
          role: "assistant" as const,
          content: "Patch preview generated.",
          blocks: [
            {
              id: "block-plan-1",
              type: "plan",
              title: "Single Agent Plan",
              items: [
                {
                  id: "step-1",
                  title: "Understand task",
                  detail: "Identify target file.",
                  status: "completed"
                }
              ]
            },
            {
              id: "block-patch-1",
              type: "patch-summary",
              patchSetId,
              summary: "Add phase 2 note",
              fileCount: 1,
              hunkCount: 1
            }
          ],
          runId: "run-1",
          createdAt: now
        }
      ]
    };

    const patchSet = {
      id: patchSetId,
      workspaceId: "workspace-1",
      sessionId,
      runId: "run-1",
      title: "Update packages/kernel/src/index.ts",
      summary: "Add phase 2 note",
      status: "ready" as const,
      createdAt: now,
      updatedAt: now,
      filePatches: [
        {
          id: "filepatch-1",
          patchSetId,
          relativePath: "packages/kernel/src/index.ts",
          beforeContent: "export const version = '0.1.0';\n",
          afterContent: "// AI Digital Life: phase 2\nexport const version = '0.1.0';\n",
          hunks: [
            {
              id: "hunk-1",
              filePatchId: "filepatch-1",
              patchSetId,
              relativePath: "packages/kernel/src/index.ts",
              oldStart: 1,
              oldLines: 1,
              newStart: 1,
              newLines: 2,
              preview: "Add phase 2 note",
              beforeText: "export const version = '0.1.0';\n",
              afterText: "// AI Digital Life: phase 2\nexport const version = '0.1.0';\n",
              decision: "accepted" as const
            }
          ]
        }
      ]
    };

    const bridge = {
      subscribeModelStream: vi.fn(() => () => undefined),
      subscribeTerminalStream: vi.fn(() => () => undefined),
      app: {
        getInfo: vi.fn(async () => ({
          ok: true,
          data: {
            appName: "AI Digital Life",
            version: "0.1.0",
            config: {
              language: "en-US",
              themeMode: "light",
              resolvedTheme: "light",
              logLevel: "info",
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
              id: "workspace-1",
              path: "E:/repo",
              rootPath: "E:/repo",
              name: "repo",
              type: "node",
              status: "ready",
              createdAt: now,
              updatedAt: now,
              lastOpenedAt: now
            },
            recentLogs: []
          }
        })),
        getHealth: vi.fn(async () => ({ ok: true, data: { timestamp: now, components: [] } })),
        getDiagnostics: vi.fn(async () => ({
          ok: true,
          data: {
            lifecycle: {
              currentStartedAt: now,
              lastShutdownWasClean: true,
              recoveredFromCrash: false
            },
            migration: {
              change: "none",
              toVersion: "0.1.0",
              executedScripts: []
            },
            events: { emitted: 0, byType: {} },
            recentErrors: []
          }
        })),
        getModelHealth: vi.fn(async () => ({
          ok: true,
          data: {
            checkedAt: now,
            providers: [
              {
                providerId: "deepseek",
                healthy: true,
                detail: "Provider responded successfully."
              },
              {
                providerId: "minimax",
                healthy: false,
                detail: "API key not configured."
              }
            ]
          }
        })),
        updatePreferences: vi.fn(async (patch) => ({
          ok: true,
          data: {
            appName: "AI Digital Life",
            version: "0.1.0",
            config: {
              language: patch.language ?? "en-US",
              themeMode: patch.themeMode ?? "light",
              resolvedTheme: patch.themeMode === "dark" ? "dark" : "light",
              logLevel: "info",
              maxRecentWorkspaces: 10,
              modelPreferences: {
                providers: {
                  deepseek: {
                    enabled: patch.modelPreferences?.deepseek?.enabled ?? true,
                    priority: patch.modelPreferences?.deepseek?.priority ?? 1,
                    modelId: patch.modelPreferences?.deepseek?.modelId ?? "deepseek-chat"
                  },
                  minimax: {
                    enabled: patch.modelPreferences?.minimax?.enabled ?? true,
                    priority: patch.modelPreferences?.minimax?.priority ?? 3,
                    modelId: patch.modelPreferences?.minimax?.modelId ?? "MiniMax-M2.5"
                  }
                }
              }
            },
            currentWorkspace: {
              id: "workspace-1",
              path: "E:/repo",
              rootPath: "E:/repo",
              name: "repo",
              type: "node",
              status: "ready",
              createdAt: now,
              updatedAt: now,
              lastOpenedAt: now
            },
            recentLogs: []
          }
        }))
      },
      workspace: {
        listRecent: vi.fn(async () => ({ ok: true, data: [] })),
        open: vi.fn(async () => ({
          ok: true,
          data: {
            id: "workspace-1",
            path: "E:/repo",
            rootPath: "E:/repo",
            name: "repo",
            type: "node",
            status: "ready",
            createdAt: now,
            updatedAt: now,
            lastOpenedAt: now
          }
        })),
        pin: vi.fn(async () => ({ ok: true, data: [] })),
        unpin: vi.fn(async () => ({ ok: true, data: [] })),
        reorder: vi.fn(async () => ({ ok: true, data: [] })),
        removeFromSidebar: vi.fn(async () => ({ ok: true, data: [] })),
        restoreToSidebar: vi.fn(async () => ({ ok: true, data: [] })),
        revealInFileManager: vi.fn(async () => ({ ok: true, data: true })),
        readFile: vi.fn(async () => ({
          ok: true,
          data: {
            path: "packages/kernel/src/index.ts",
            content: patchSet.filePatches[0].afterContent,
            lastModifiedAt: now
          }
        })),
        search: vi.fn(async () => ({ ok: true, data: [] })),
        outline: vi.fn(async () => ({ ok: true, data: [] })),
        setEditorDirtyPaths: vi.fn(async () => ({ ok: true, data: true })),
        onFileChanged: vi.fn(() => () => undefined)
      },
      retrieval: {
        getStatus: vi.fn(async () => ({ ok: true, data: undefined }))
      },
      conversation: {
        createSession: vi.fn(async () => ({ ok: true, data: conversationDetail.session })),
        listSessions: vi.fn(async () => ({ ok: true, data: [conversationDetail.session] })),
        getSession: vi.fn(async () => ({ ok: true, data: conversationDetail })),
        renameSession: vi.fn(async () => ({ ok: true, data: conversationDetail.session })),
        pinSession: vi.fn(async () => ({ ok: true, data: conversationDetail.session })),
        unpinSession: vi.fn(async () => ({ ok: true, data: conversationDetail.session })),
        reorderSessions: vi.fn(async () => ({ ok: true, data: [conversationDetail.session] })),
        markSessionRead: vi.fn(async () => ({ ok: true, data: conversationDetail.session })),
        markSessionUnread: vi.fn(async () => ({ ok: true, data: conversationDetail.session })),
        archiveSession: vi.fn(async () => ({ ok: true, data: conversationDetail.session })),
        archiveAllInWorkspace: vi.fn(async () => ({ ok: true, data: [conversationDetail.session] })),
        deleteSession: vi.fn(async () => ({ ok: true, data: true })),
        sendMessage: vi.fn(async () => ({
          ok: true,
          data: {
            session: conversationDetail.session,
            userMessage: conversationDetail.messages[0],
            assistantMessage: conversationDetail.messages[0],
            runDetail: {
              run: {
                id: "run-1",
                workspaceId: "workspace-1",
                sessionId,
                prompt: "mock",
                scenario: "code-edit",
                status: "ready",
                createdAt: now,
                updatedAt: now
              },
              steps: [
                {
                  id: "step-1",
                  runId: "run-1",
                  title: "Understand task",
                  status: "completed",
                  createdAt: now,
                  updatedAt: now
                }
              ]
            },
            patchSet
          }
        })),
        cancelMessage: vi.fn(async () => ({ ok: true, data: undefined }))
      },
      agent: {
        startRun: vi.fn(),
        getRun: vi.fn(async () => ({ ok: true, data: undefined })),
        retryRun: vi.fn(async () => ({ ok: true, data: undefined })),
        abortRun: vi.fn(async () => ({ ok: true, data: undefined }))
      },
      patch: {
        getPatchSet: vi.fn(async () => ({ ok: true, data: patchSet })),
        setHunkDecision: vi.fn(async () => ({ ok: true, data: patchSet })),
        applyPatchSet: vi.fn(async () => ({
          ok: true,
          data: {
            patchSet: {
              ...patchSet,
              status: "applied"
            },
            validation: {
              id: "validation-1",
              workspaceId: "workspace-1",
              runId: "run-1",
              patchSetId,
              status: "passed",
              summary: "Validation command completed successfully.",
              diagnostics: [],
              createdAt: now
            },
            commandResult: {
              request: {
                id: "command-1",
                workspaceId: "workspace-1",
                runId: "run-1",
                profile: "test",
                command: "npm",
                args: ["run", "test"],
                shell: false,
                riskLevel: "low",
                createdAt: now
              },
              exitCode: 0,
              stdout: "ok",
              stderr: "",
              summary: "ok",
              success: true,
              startedAt: now,
              completedAt: now
            },
            rolledBack: false
          }
        })),
        rollbackPatchSet: vi.fn(async () => ({
          ok: true,
          data: {
            ...patchSet,
            status: "rolled-back"
          }
        }))
      },
      command: {
        getProfiles: vi.fn(async () => ({ ok: true, data: [] })),
        runStream: vi.fn(async () => ({
          ok: true,
          data: {
            mode: "started" as const,
            executionId: "exec-test-1",
            taskId: "task-stream-1",
            request: {
              id: "command-stream-1",
              workspaceId: "workspace-1",
              profile: "test" as const,
              command: "npm",
              args: ["run", "test"],
              shell: false,
              riskLevel: "low" as const,
              createdAt: now
            }
          }
        })),
        stopStream: vi.fn(async () => ({ ok: true, data: true })),
        run: vi.fn(async () => ({
          ok: true,
          data: {
            status: "waiting-approval",
            taskId: "task-command-1",
            request: {
              id: "command-run-1",
              workspaceId: "workspace-1",
              profile: "install",
              command: "npm",
              args: ["install"],
              shell: false,
              riskLevel: "high",
              createdAt: now
            },
            approvalRequest: {
              id: "approval-command-1",
              taskId: "task-command-1",
              title: "command.install",
              description: "Install requires approval.",
              riskLevel: "high",
              impact: ["Dependency graph may change."],
              reversible: true,
              createdAt: now
            }
          }
        }))
      },
      task: {
        getSnapshot: vi.fn(async () => ({
          ok: true,
          data: {
            tasks: [],
            pendingApprovals,
            policy: {
              mode: "manual",
              summary: "Manual approvals enabled.",
              highRiskRules: []
            }
          }
        })),
        getCheckpointPreview: vi.fn(async () => ({ ok: true, data: undefined })),
        restoreCheckpoint: vi.fn(async () => ({
          ok: true,
          data: {
            tasks: [],
            pendingApprovals: [],
            policy: {
              mode: "manual",
              summary: "Manual approvals enabled.",
              highRiskRules: []
            }
          }
        })),
        decideApproval: vi.fn(async () => {
          pendingApprovals = [];
          return {
            ok: true,
            data: {
              tasks: [],
              pendingApprovals: [],
              policy: {
                mode: "manual",
                summary: "Manual approvals enabled.",
                highRiskRules: []
              }
            }
          };
        })
      }
    };

    vi.stubGlobal("window", window);
    Object.assign(window, { digitalLife: bridge });

    await import("../../apps/desktop/renderer/src/main.tsx");
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (document.body.textContent?.includes("Conversation")) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    expect(document.body.textContent).toContain("Conversation");
    expect(document.body.textContent).toContain("Patch Preview");
    expect(document.body.textContent).toContain("dirty-worktree.guard");
    expect(document.body.textContent).toContain("Model Settings");

    expect(document.body.textContent).toContain("Patch preview generated.");
    expect(document.body.textContent).toContain("packages/kernel/src/index.ts");

    const approveButton = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "Approve"
    );
    approveButton?.click();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(bridge.task.decideApproval).toHaveBeenCalledWith({ approvalId: "approval-1", decision: "approved" });

    const runCommandButton = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "Run Command"
    );
    runCommandButton?.click();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(bridge.command.run).toHaveBeenCalledWith({ command: "npm", args: ["run", "test"] });

    const applyButton = document.querySelector<HTMLButtonElement>("[data-testid='patch-apply']");
    applyButton?.click();
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(bridge.patch.applyPatchSet).toHaveBeenCalledWith(patchSetId);
  });
});
