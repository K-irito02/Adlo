// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("desktop renderer shell", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
  });

  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("renders diagnostics, approves a request, and exposes checkpoint restore", async () => {
    const now = Date.now();
    const bridge = {
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
              maxRecentWorkspaces: 10
            },
            currentWorkspace: {
              id: "ws-1",
              path: "E:/repo",
              rootPath: "E:/repo",
              name: "repo",
              type: "node",
              status: "ready",
              createdAt: now,
              updatedAt: now,
              lastOpenedAt: now
            },
            recentLogs: [
              {
                timestamp: now,
                level: "info",
                scope: "main",
                message: "booted"
              }
            ]
          }
        })),
        getHealth: vi.fn(async () => ({
          ok: true,
          data: {
            timestamp: now,
            components: [
              { name: "main", status: "healthy", detail: "Main ok", updatedAt: now },
              { name: "worker", status: "healthy", detail: "Worker ok", updatedAt: now },
              { name: "storage", status: "healthy", detail: "Storage ok", updatedAt: now },
              { name: "recovery", status: "healthy", detail: "Recovery ok", updatedAt: now },
              { name: "migration", status: "healthy", detail: "Migration ok", updatedAt: now }
            ]
          }
        })),
        getDiagnostics: vi.fn(async () => ({
          ok: true,
          data: {
            lifecycle: {
              currentStartedAt: now,
              lastShutdownAt: now - 1000,
              lastShutdownWasClean: true,
              recoveredFromCrash: false
            },
            migration: {
              change: "upgrade",
              fromVersion: "0.0.0",
              toVersion: "0.1.0",
              backupPath: "E:/backup",
              executedScripts: [
                {
                  scriptId: "001-bootstrap-user-data-layout",
                  status: "completed"
                }
              ]
            },
            events: {
              emitted: 3,
              byType: {
                "app.initialized": 1,
                "workspace.opened": 1,
                "approval.requested": 1
              }
            },
            recentErrors: []
          }
        })),
        updatePreferences: vi.fn(async () => ({ ok: true, data: undefined }))
      },
      workspace: {
        listRecent: vi.fn(async () => ({ ok: true, data: [] })),
        open: vi.fn(async () => ({
          ok: true,
          data: {
            id: "ws-1",
            path: "E:/repo",
            rootPath: "E:/repo",
            name: "repo",
            type: "node",
            status: "ready",
            createdAt: now,
            updatedAt: now,
            lastOpenedAt: now
          }
        }))
      },
      retrieval: {
        getStatus: vi.fn(async () => ({ ok: true, data: undefined }))
      },
      task: {
        getSnapshot: vi.fn(async () => ({
          ok: true,
          data: {
            tasks: [],
            pendingApprovals: [
              {
                id: "approval-1",
                taskId: "task-1",
                title: "dirty-worktree.guard",
                description: "Needs review",
                riskLevel: "high",
                impact: ["Git conflicts detected"],
                reversible: true,
                createdAt: now
              }
            ],
            currentSession: {
              id: "session-1",
              workspaceId: "ws-1",
              status: "active",
              approvalMode: "manual",
              summary: {
                lastTaskId: "task-1"
              },
              createdAt: now,
              updatedAt: now
            },
            latestCheckpoint: undefined,
            policy: {
              mode: "manual",
              summary: "Manual approvals enabled.",
              highRiskRules: ["Destructive changes need approval."]
            }
          }
        })),
        getCheckpointPreview: vi.fn(async (checkpointId: string) => ({
          ok: true,
          data:
            checkpointId === "checkpoint-1"
              ? {
                  checkpointId: "checkpoint-1",
                  manifestPath: "E:/manifest.json",
                  rootPath: "E:/repo",
                  assetCount: 1,
                  assets: [
                    {
                      path: "src/index.ts",
                      kind: "file",
                      status: "captured",
                      size: 42,
                      snapshotPath: "E:/snapshot"
                    }
                  ]
                }
              : undefined
        })),
        decideApproval: vi.fn(async () => ({
          ok: true,
          data: {
            tasks: [
              {
                id: "task-1",
                title: "workspace.git-snapshot",
                description: "Capture dirty worktree",
                status: "approved",
                riskLevel: "high",
                updatedAt: now,
                detail: "Approved."
              }
            ],
            pendingApprovals: [],
            currentSession: {
              id: "session-1",
              workspaceId: "ws-1",
              status: "active",
              approvalMode: "manual",
              summary: {
                lastTaskId: "task-1",
                lastCheckpointId: "checkpoint-1"
              },
              createdAt: now,
              updatedAt: now
            },
            latestCheckpoint: {
              id: "checkpoint-1",
              sessionId: "session-1",
              workspaceId: "ws-1",
              type: "approval-anchor",
              description: "Checkpoint ready",
              manifest: {},
              createdAt: now
            },
            policy: {
              mode: "manual",
              summary: "Manual approvals enabled.",
              highRiskRules: ["Destructive changes need approval."]
            }
          }
        })),
        restoreCheckpoint: vi.fn(async () => ({
          ok: true,
          data: {
            tasks: [
              {
                id: "task-restore",
                title: "checkpoint.restore",
                description: "Restore checkpoint",
                status: "rolled-back",
                riskLevel: "medium",
                updatedAt: now,
                detail: "Restored."
              }
            ],
            pendingApprovals: [],
            currentSession: {
              id: "session-1",
              workspaceId: "ws-1",
              status: "active",
              approvalMode: "manual",
              summary: {
                lastTaskId: "task-restore",
                lastCheckpointId: "checkpoint-1"
              },
              createdAt: now,
              updatedAt: now
            },
            latestCheckpoint: {
              id: "checkpoint-1",
              sessionId: "session-1",
              workspaceId: "ws-1",
              type: "approval-anchor",
              description: "Checkpoint ready",
              manifest: {},
              createdAt: now
            },
            policy: {
              mode: "manual",
              summary: "Manual approvals enabled.",
              highRiskRules: ["Destructive changes need approval."]
            }
          }
        }))
      }
    };

    vi.stubGlobal("window", window);
    Object.assign(window, { digitalLife: bridge });

    await import("../../apps/desktop/renderer/src/main");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.body.textContent).toContain("AI Digital Life");
    expect(document.body.textContent).toContain("Migration and upgrade");
    expect(document.body.textContent).toContain("001-bootstrap-user-data-layout");

    const approveButton = document.querySelector<HTMLButtonElement>("[data-approval-decision='approved']");
    expect(approveButton).not.toBeNull();
    approveButton?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(bridge.task.decideApproval).toHaveBeenCalledWith({
      approvalId: "approval-1",
      decision: "approved",
      reason: undefined
    });
    expect(document.body.textContent).toContain("Restore this checkpoint");

    const restoreButton = document.querySelector<HTMLButtonElement>("[data-restore-checkpoint='checkpoint-1']");
    restoreButton?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(bridge.task.restoreCheckpoint).toHaveBeenCalledWith("checkpoint-1");
    expect(document.body.textContent).toContain("Checkpoint restore executed.");
  });
});
