import fs from "node:fs/promises";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { app, BrowserWindow, ipcMain, nativeTheme } from "electron";
import { applyConfigPatch, loadConfig, saveConfig } from "@ai-digital-life/config";
import { ErrorBoundary, ErrorReporter } from "@ai-digital-life/errors";
import { getGlobalEventBus, type EventBus } from "@ai-digital-life/events";
import {
  APP_NAME,
  APP_VERSION,
  ERROR_CODES,
  EVENT_NAMES,
  type AppInfo,
  type AppPreferencePatch,
  APPROVAL_POLICY_MODE,
  type ApprovalRecord,
  type ApprovalRequestSummary,
  type BaseEvent,
  type CheckpointRecord,
  type CheckpointPayloadPreview,
  type ConfigSnapshot,
  type EventDiagnostics,
  type HealthSnapshot,
  type IpcResult,
  type LogEntrySummary,
  type RetrievalSnapshot,
  type RuntimeDiagnosticsSnapshot,
  type RuntimeLifecycleSnapshot,
  type RiskLevel,
  type TaskOperation,
  type TaskRecord,
  type TaskCenterSnapshot,
  type TaskStatus,
  ok,
  err,
  createId,
  toUserMessage
} from "@ai-digital-life/kernel";
import { createLoggerFactory, type Logger } from "@ai-digital-life/logger";
import {
  BackupManager,
  MigrationRegistry,
  MigrationRunner,
  registerDefaultMigrations,
  VersionDetector,
  parseVersion
} from "@ai-digital-life/migration";
import { StateRepository } from "@ai-digital-life/storage";
import { WorkspaceService } from "@ai-digital-life/workspace";

type Runtime = {
  configDir: string;
  lifecycleFilePath: string;
  config: ConfigSnapshot;
  logger: Logger;
  errorReporter: ErrorReporter;
  eventBus: EventBus;
  diagnostics: RuntimeDiagnosticsSnapshot;
  stateRepository: StateRepository;
  workspaceService: WorkspaceService;
  getRecentLogs: (limit?: number) => LogEntrySummary[];
  retrieval: RetrievalController;
};

type MigrationBootstrapResult = RuntimeDiagnosticsSnapshot["migration"];
type RuntimeStatusFile = {
  lastStartedAt: number;
  lastShutdownAt?: number;
  cleanShutdown: boolean;
};

class RetrievalController {
  private readonly logger: Logger;
  private readonly workerPath: string;
  private readonly onSnapshot?: (snapshot: RetrievalSnapshot) => Promise<void> | void;
  private worker?: Worker;
  private lastHeartbeatAt = 0;
  private storageHealthy = false;
  private currentSnapshot?: RetrievalSnapshot;

  constructor(workerPath: string, logger: Logger, onSnapshot?: (snapshot: RetrievalSnapshot) => Promise<void> | void) {
    this.workerPath = workerPath;
    this.logger = logger;
    this.onSnapshot = onSnapshot;
  }

  async start(stateRepository: StateRepository): Promise<void> {
    this.worker = new Worker(this.workerPath);
    this.worker.on("message", (message: unknown) => {
      const payload = message as { type?: string; snapshot?: RetrievalSnapshot };

      if (
        (payload.type === "index-progress" || payload.type === "index-complete" || payload.type === "index-failed") &&
        payload.snapshot
      ) {
        this.currentSnapshot = payload.snapshot;
        this.lastHeartbeatAt = Date.now();
        void stateRepository.saveRetrievalSnapshot(payload.snapshot);
        void this.onSnapshot?.(payload.snapshot);
      }
    });
    this.worker.on("error", (error) => {
      this.logger.error(`Retrieval worker failed: ${error.message}`);
    });
  }

  markStorageHealthy(): void {
    this.storageHealthy = true;
  }

  async shutdown(): Promise<void> {
    if (!this.worker) {
      return;
    }
    this.worker.postMessage({ type: "shutdown" });
    await this.worker.terminate();
    this.worker = undefined;
  }

  async startIndexing(workspaceId: string, rootPath: string): Promise<void> {
    if (!this.worker) {
      throw new Error("Retrieval worker is not available.");
    }

    const startedAt = Date.now();
    this.currentSnapshot = {
      workspaceId,
      rootPath,
      status: "running",
      scannedFiles: 0,
      indexedTextFiles: 0,
      startedAt,
      updatedAt: startedAt,
      topExtensions: [],
      repoMap: []
    };
    this.worker.postMessage({
      type: "start-index",
      workspaceId,
      rootPath
    });
  }

  async getSnapshot(stateRepository: StateRepository, workspaceId?: string): Promise<RetrievalSnapshot | undefined> {
    if (this.currentSnapshot && (!workspaceId || this.currentSnapshot.workspaceId === workspaceId)) {
      return this.currentSnapshot;
    }

    if (!workspaceId) {
      return undefined;
    }

    return stateRepository.getRetrievalSnapshot(workspaceId);
  }

  snapshot(): HealthSnapshot {
    const now = Date.now();
    const workerHealthy = this.lastHeartbeatAt > 0 && now - this.lastHeartbeatAt < 5000;

    return {
      timestamp: now,
      components: [
        {
          name: "main",
          status: "healthy",
          detail: "Electron main process running",
          updatedAt: now
        },
        {
          name: "worker",
          status: workerHealthy ? "healthy" : "degraded",
          detail: workerHealthy
            ? this.currentSnapshot?.status === "running"
              ? "Retrieval worker indexing workspace"
              : "Retrieval worker ready"
            : "Waiting for retrieval worker activity",
          updatedAt: this.lastHeartbeatAt || now
        },
        {
          name: "storage",
          status: this.storageHealthy ? "healthy" : "degraded",
          detail: this.storageHealthy ? "State storage initialized" : "State storage not ready",
          updatedAt: now
        }
      ]
    };
  }
}

let mainWindow: BrowserWindow | null = null;
let runtime: Runtime | null = null;

async function readRuntimeStatus(statusFilePath: string): Promise<RuntimeStatusFile | undefined> {
  try {
    const raw = await fs.readFile(statusFilePath, "utf8");
    return JSON.parse(raw) as RuntimeStatusFile;
  } catch {
    return undefined;
  }
}

async function markRuntimeStarted(statusFilePath: string): Promise<RuntimeLifecycleSnapshot> {
  const previous = await readRuntimeStatus(statusFilePath);
  const currentStartedAt = Date.now();
  const snapshot: RuntimeLifecycleSnapshot = {
    currentStartedAt,
    lastShutdownAt: previous?.lastShutdownAt,
    lastShutdownWasClean: previous?.cleanShutdown ?? true,
    recoveredFromCrash: previous ? !previous.cleanShutdown : false
  };

  await fs.mkdir(path.dirname(statusFilePath), { recursive: true });
  await fs.writeFile(
    statusFilePath,
    JSON.stringify(
      {
        lastStartedAt: currentStartedAt,
        lastShutdownAt: previous?.lastShutdownAt,
        cleanShutdown: false
      } satisfies RuntimeStatusFile,
      null,
      2
    ),
    "utf8"
  );

  return snapshot;
}

async function markRuntimeStopped(statusFilePath: string): Promise<void> {
  const existing = await readRuntimeStatus(statusFilePath);
  const now = Date.now();
  await fs.mkdir(path.dirname(statusFilePath), { recursive: true });
  await fs.writeFile(
    statusFilePath,
    JSON.stringify(
      {
        lastStartedAt: existing?.lastStartedAt ?? now,
        lastShutdownAt: now,
        cleanShutdown: true
      } satisfies RuntimeStatusFile,
      null,
      2
    ),
    "utf8"
  );
}

function createInitialDiagnostics(lifecycle: RuntimeLifecycleSnapshot): RuntimeDiagnosticsSnapshot {
  return {
    lifecycle,
    migration: {
      change: "none",
      toVersion: APP_VERSION,
      executedScripts: []
    },
    events: {
      emitted: 0,
      byType: {}
    },
    recentErrors: []
  };
}

async function emitRuntimeEvent(eventBus: EventBus, diagnostics: RuntimeDiagnosticsSnapshot, event: BaseEvent): Promise<void> {
  diagnostics.events.emitted += 1;
  diagnostics.events.byType[event.type] = (diagnostics.events.byType[event.type] ?? 0) + 1;
  await eventBus.emit(event);
}

async function recordRuntimeError(
  errorReporter: ErrorReporter,
  diagnostics: RuntimeDiagnosticsSnapshot,
  logger: Logger,
  error: unknown,
  context: Record<string, unknown>
): Promise<void> {
  const resolved = error instanceof Error ? error : new Error(String(error));
  logger.error(`Runtime error: ${resolved.message}`, resolved, context);
  const report = await errorReporter.generateReport(resolved, context);
  diagnostics.recentErrors.unshift({
    id: report.id,
    timestamp: report.timestamp,
    name: report.error.name,
    message: report.error.message
  });
  diagnostics.recentErrors = diagnostics.recentErrors.slice(0, 5);
}

function createHealthSnapshot(runtimeState: Runtime): HealthSnapshot {
  const base = runtimeState.retrieval.snapshot();
  const recoveryStatus = runtimeState.diagnostics.lifecycle.recoveredFromCrash ? "degraded" : "healthy";
  const migrationFailed = runtimeState.diagnostics.migration.executedScripts.some((script) => script.status === "failed");

  return {
    timestamp: Date.now(),
    components: [
      ...base.components,
      {
        name: "recovery",
        status: recoveryStatus,
        detail: runtimeState.diagnostics.lifecycle.recoveredFromCrash
          ? "Recovered from a previous unclean shutdown."
          : "Previous shutdown completed cleanly.",
        updatedAt: runtimeState.diagnostics.lifecycle.currentStartedAt
      },
      {
        name: "migration",
        status: migrationFailed ? "unavailable" : "healthy",
        detail:
          runtimeState.diagnostics.migration.change === "upgrade"
            ? `Upgrade evaluated for ${runtimeState.diagnostics.migration.toVersion} with ${runtimeState.diagnostics.migration.executedScripts.length} scripts.`
            : `No migration required for ${runtimeState.diagnostics.migration.toVersion}.`,
        updatedAt: runtimeState.diagnostics.lifecycle.currentStartedAt
      }
    ]
  };
}

async function initializeMigrations(userDataPath: string, logger: Logger): Promise<MigrationBootstrapResult> {
  const detector = new VersionDetector(userDataPath, parseVersion(APP_VERSION));
  const storedVersion = await detector.getStoredVersion();
  const change = await detector.detectChange();

  if (change === "none") {
    return {
      change,
      fromVersion: storedVersion
        ? `${storedVersion.major}.${storedVersion.minor}.${storedVersion.patch}`
        : undefined,
      toVersion: APP_VERSION,
      executedScripts: []
    };
  }

  const backupManager = new BackupManager(path.join(userDataPath, "backups"), userDataPath);
  const registry = new MigrationRegistry();
  registerDefaultMigrations(registry, userDataPath);
  const runner = new MigrationRunner(registry);

  if (storedVersion) {
    const backup = await backupManager.createBackup(
      `${storedVersion.major}.${storedVersion.minor}.${storedVersion.patch}`,
      ["config", "state"]
    );
    logger.info(`Created upgrade backup at ${backup.path}`);
    const records = await runner.run(storedVersion, parseVersion(APP_VERSION));
    logger.info(`Migration bootstrap completed with ${records.length} registered scripts.`);
    await detector.saveCurrentVersion();
    return {
      change,
      fromVersion: `${storedVersion.major}.${storedVersion.minor}.${storedVersion.patch}`,
      toVersion: APP_VERSION,
      backupPath: backup.path,
      executedScripts: records.map((record) => ({
        scriptId: record.scriptId,
        status: record.status,
        error: record.error
      }))
    };
  }

  await detector.saveCurrentVersion();
  return {
    change,
    toVersion: APP_VERSION,
    executedScripts: []
  };
}

async function createRuntime(): Promise<Runtime> {
  const userDataPath = app.getPath("userData");
  const configDir = path.join(userDataPath, "config");
  const stateDir = path.join(userDataPath, "state");
  const logDir = path.join(userDataPath, "logs");
  const lifecycleFilePath = path.join(stateDir, "runtime-status.json");
  const lifecycle = await markRuntimeStarted(lifecycleFilePath);
  const config = await loadConfig(configDir, nativeTheme.shouldUseDarkColors);
  const loggerFactory = await createLoggerFactory(logDir, config.logLevel);
  const logger = loggerFactory.createLogger("main");
  const errorReporter = new ErrorReporter();
  const eventBus = getGlobalEventBus();
  const diagnostics = createInitialDiagnostics(lifecycle);
  const migrationBoundary = new ErrorBoundary("migration-init", logger, async (error) => {
    await recordRuntimeError(errorReporter, diagnostics, logger, error, { surface: "migration-init" });
  });
  const migrationResult = await migrationBoundary.wrap(async () =>
    logger.measure("initialize migrations", () => initializeMigrations(userDataPath, logger))
  );
  if (migrationResult) {
    diagnostics.migration = migrationResult;
  }
  const stateRepository = new StateRepository(stateDir, loggerFactory.createLogger("storage"));
  await stateRepository.initialize();
  const initialState = await stateRepository.load();
  const workspaceService = new WorkspaceService({
    stateRepository,
    logger: loggerFactory.createLogger("workspace"),
    maxRecentWorkspaces: config.maxRecentWorkspaces,
    initialState
  });
  const retrieval = new RetrievalController(
    require.resolve("@ai-digital-life/retrieval-worker"),
    loggerFactory.createLogger("retrieval"),
    async (snapshot) => {
      await emitRuntimeEvent(eventBus, diagnostics, {
        type: EVENT_NAMES.retrievalStatusChanged,
        timestamp: Date.now(),
        payload: {
          workspaceId: snapshot.workspaceId,
          status: snapshot.status
        }
      });
    }
  );
  await retrieval.start(stateRepository);
  retrieval.markStorageHealthy();
  const currentWorkspace = workspaceService.getCurrentWorkspace();
  if (currentWorkspace) {
    await workspaceService.ensureSession(currentWorkspace.id);
    await retrieval.startIndexing(currentWorkspace.id, currentWorkspace.rootPath);
  }
  logger.info("Runtime initialized.");

  await emitRuntimeEvent(eventBus, diagnostics, {
    type: EVENT_NAMES.appInitialized,
    timestamp: Date.now(),
    payload: {
      version: APP_VERSION
    }
  });

  return {
    configDir,
    lifecycleFilePath,
    config,
    logger,
    errorReporter,
    eventBus,
    diagnostics,
    stateRepository,
    workspaceService,
    getRecentLogs: loggerFactory.getRecentEntries,
    retrieval
  };
}

function createAppInfo(): AppInfo {
  if (!runtime) {
    throw new Error("Runtime not initialized.");
  }

  return {
    appName: APP_NAME,
    version: APP_VERSION,
    config: runtime.config,
    currentWorkspace: runtime.workspaceService.getCurrentWorkspace(),
    recentLogs: runtime.getRecentLogs(12)
  };
}

function mapRetrievalStatusToTaskStatus(status: RetrievalSnapshot["status"]): TaskStatus {
  switch (status) {
    case "running":
      return "running";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    default:
      return "pending";
  }
}

function mapRetrievalStatusToRiskLevel(status: RetrievalSnapshot["status"]): RiskLevel {
  return status === "failed" ? "medium" : "low";
}

async function upsertSystemTask(input: {
  workspaceId: string;
  sessionId: string;
  type: string;
  description: string;
  status: TaskStatus;
  priority?: TaskRecord["priority"];
  operations?: TaskOperation[];
  approvalId?: string;
  detail: string;
}): Promise<TaskRecord> {
  if (!runtime) {
    throw new Error("Runtime not initialized.");
  }

  const existing = (await runtime.stateRepository.listTasksByWorkspace(input.workspaceId)).find((task) => task.type === input.type);
  const now = Date.now();
  const nextTask: TaskRecord = {
    id: existing?.id ?? createId("task"),
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    type: input.type,
    description: input.description,
    status: input.status,
    priority: input.priority ?? "medium",
    operations: input.operations ?? [],
    approvalId: input.approvalId,
    resultJson: input.status === "completed" ? input.detail : existing?.resultJson,
    errorJson: input.status === "failed" ? input.detail : undefined,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    startedAt: input.status === "running" ? existing?.startedAt ?? now : existing?.startedAt,
    completedAt: input.status === "completed" ? now : undefined
  };

  await runtime.stateRepository.upsertTask(nextTask);
  await runtime.stateRepository.appendAuditRecord({
    entityType: "task",
    entityId: nextTask.id,
    action: "task.upserted",
    detail: `${nextTask.type}:${nextTask.status}`,
    createdAt: now
  });
  await emitRuntimeEvent(runtime.eventBus, runtime.diagnostics, {
    type: EVENT_NAMES.taskUpserted,
    timestamp: now,
    payload: {
      workspaceId: input.workspaceId,
      taskId: nextTask.id,
      status: nextTask.status
    }
  });

  return nextTask;
}

async function syncGovernanceState(): Promise<void> {
  if (!runtime) {
    return;
  }

  const workspace = runtime.workspaceService.getCurrentWorkspace();
  if (!workspace) {
    return;
  }

  const session = await runtime.workspaceService.ensureSession(workspace.id);
  const retrieval = await runtime.retrieval.getSnapshot(runtime.stateRepository, workspace.id);

  await upsertSystemTask({
    workspaceId: workspace.id,
    sessionId: session.id,
    type: "workspace.restore",
    description: "Restore the latest workspace session into the desktop shell.",
    status: "completed",
    priority: "medium",
    detail: `Workspace ${workspace.name} is attached and ready.`
  });

  const gitRisk: RiskLevel =
    workspace.gitSnapshot && (workspace.gitSnapshot.conflicts.length > 0 || workspace.gitSnapshot.unstaged.length > 20)
      ? "high"
      : workspace.gitSnapshot && workspace.gitSnapshot.untracked.length > 20
        ? "medium"
        : "low";
  const gitStatus: TaskStatus = workspace.gitSnapshot?.conflicts.length ? "waiting-approval" : "completed";
  const gitTask = await upsertSystemTask({
    workspaceId: workspace.id,
    sessionId: session.id,
    type: "workspace.git-snapshot",
    description: "Capture dirty worktree state before future risky actions.",
    status: gitStatus,
    priority: "high",
    operations: [
      {
        kind: "workspace.git.inspect",
        target: workspace.rootPath,
        params: {
          branch: workspace.gitSnapshot?.branch
        },
        riskLevel: gitRisk,
        reversible: true
      }
    ],
    detail: workspace.gitSnapshot?.isRepo
      ? `branch=${workspace.gitSnapshot.branch ?? "detached"}, conflicts=${workspace.gitSnapshot.conflicts.length}, unstaged=${workspace.gitSnapshot.unstaged.length}, untracked=${workspace.gitSnapshot.untracked.length}`
      : "Workspace is not a Git repository."
  });

  if (gitRisk === "high") {
    const existingApprovals = await runtime.stateRepository.listPendingApprovals(workspace.id);
    const existing = existingApprovals.find((approval) => approval.taskId === gitTask.id);

    if (!existing) {
      const now = Date.now();
      const request: ApprovalRequestSummary = {
        id: createId("approval"),
        taskId: gitTask.id,
        title: "dirty-worktree.guard",
        description: "Resolve conflicts or large dirty changes before high-risk actions continue.",
        riskLevel: "high",
        impact: [
          "Conflicted files can invalidate patch or write actions.",
          "High-risk actions should wait until the worktree is stable."
        ],
        reversible: true,
        createdAt: now,
        expiresAt: now + 15 * 60 * 1000
      };
      const approval: ApprovalRecord = {
        id: request.id,
        taskId: gitTask.id,
        workspaceId: workspace.id,
        riskLevel: request.riskLevel,
        request,
        createdAt: now,
        expiresAt: request.expiresAt
      };
      await runtime.stateRepository.upsertApproval(approval);
      await runtime.stateRepository.appendAuditRecord({
        entityType: "approval",
        entityId: approval.id,
        action: "approval.requested",
        detail: approval.request.description,
        createdAt: now
      });
      await emitRuntimeEvent(runtime.eventBus, runtime.diagnostics, {
        type: EVENT_NAMES.approvalRequested,
        timestamp: now,
        payload: {
          workspaceId: workspace.id,
          approvalId: approval.id,
          taskId: approval.taskId
        }
      });
    }
  }

  const retrievalStatus = retrieval ? mapRetrievalStatusToTaskStatus(retrieval.status) : "pending";
  await upsertSystemTask({
    workspaceId: workspace.id,
    sessionId: session.id,
    type: "retrieval.index",
    description: "Maintain the local repository map and retrieval snapshot.",
    status: retrievalStatus,
    priority: "medium",
    operations: [
      {
        kind: "retrieval.index",
        target: workspace.rootPath,
        params: {},
        riskLevel: mapRetrievalStatusToRiskLevel(retrieval?.status ?? "idle"),
        reversible: true
      }
    ],
    detail: retrieval
      ? retrieval.status === "failed"
        ? retrieval.lastError ?? "Retrieval worker reported a failure."
        : `Scanned ${retrieval.scannedFiles} files and indexed ${retrieval.indexedTextFiles} text files.`
      : "Waiting for the first indexing run after workspace selection."
  });

  await runtime.workspaceService.updateSessionSummary(
    workspace.id,
    {
      lastIndexVersion: retrieval ? String(retrieval.updatedAt) : undefined,
      lastTaskId: gitTask.id,
      notes: workspace.gitSnapshot?.conflicts.length ? ["Dirty worktree requires approval before high-risk actions."] : []
    },
    gitTask.id
  );
}

async function expirePendingApprovals(workspaceId: string): Promise<void> {
  if (!runtime) {
    return;
  }

  const approvals = await runtime.stateRepository.listPendingApprovals(workspaceId);
  const expired = approvals.filter((approval) => approval.expiresAt && approval.expiresAt <= Date.now());
  for (const approval of expired) {
    await runtime.stateRepository.decideApproval({
      approvalId: approval.id,
      decision: "timeout",
      reason: "Approval request timed out.",
      approvedBy: "system-timeout"
    });

    const tasks = await runtime.stateRepository.listTasksByWorkspace(workspaceId);
    const relatedTask = tasks.find((task) => task.id === approval.taskId);
    if (relatedTask) {
      await runtime.stateRepository.upsertTask({
        ...relatedTask,
        status: "rejected",
        errorJson: "Approval request timed out.",
        updatedAt: Date.now()
      });
      await runtime.stateRepository.appendAuditRecord({
        entityType: "task",
        entityId: relatedTask.id,
        action: "task.rejected.timeout",
        detail: "Approval request timed out.",
        createdAt: Date.now()
      });
    }

    await runtime.stateRepository.appendAuditRecord({
      entityType: "approval",
      entityId: approval.id,
      action: "approval.timeout",
      detail: "Approval request timed out.",
      createdAt: Date.now()
    });
    await emitRuntimeEvent(runtime.eventBus, runtime.diagnostics, {
      type: EVENT_NAMES.approvalDecided,
      timestamp: Date.now(),
      payload: {
        approvalId: approval.id,
        decision: "timeout",
        workspaceId
      }
    });
  }
}

async function createTaskCenterSnapshot(): Promise<TaskCenterSnapshot> {
  if (!runtime) {
    throw new Error("Runtime not initialized.");
  }

  await syncGovernanceState();

  const currentWorkspace = runtime.workspaceService.getCurrentWorkspace();
  if (currentWorkspace) {
    await expirePendingApprovals(currentWorkspace.id);
  }
  const now = Date.now();
  const tasks = currentWorkspace
    ? (await runtime.stateRepository.listTasksByWorkspace(currentWorkspace.id)).map((task) => ({
        id: task.id,
        title: task.type,
        description: task.description,
        status: task.status,
        riskLevel:
          task.operations.find((operation) => operation.riskLevel === "high")?.riskLevel ??
          task.operations.find((operation) => operation.riskLevel === "medium")?.riskLevel ??
          "low",
        updatedAt: task.updatedAt,
        detail:
          task.status === "failed"
            ? task.errorJson ?? `Task ${task.type} failed.`
            : task.resultJson ?? `Task ${task.type} is currently ${task.status}.`
      }))
    : [
        {
          id: "workspace-onboarding",
          title: "workspace.open",
          description: "Select a workspace to initialize recovery, retrieval, and governance views.",
          status: "pending" as const,
          riskLevel: "low" as const,
          updatedAt: now,
          detail: "No active workspace is attached yet."
        }
      ];

  return {
    tasks,
    pendingApprovals: currentWorkspace
      ? (await runtime.stateRepository.listPendingApprovals(currentWorkspace.id)).map((approval) => approval.request)
      : [],
    currentSession: currentWorkspace ? await runtime.workspaceService.getCurrentSession() : undefined,
    latestCheckpoint: currentWorkspace ? await runtime.stateRepository.getLatestCheckpoint(currentWorkspace.id) : undefined,
    policy: {
      mode: APPROVAL_POLICY_MODE,
      summary: "High-risk actions stay approval-bound in Phase 0 and are not exposed directly in the renderer.",
      highRiskRules: [
        "Destructive file changes require explicit approval.",
        "Force Git actions and command execution stay blocked behind future governance flows.",
        "Renderer only shows approval state and never receives raw system privileges."
      ]
    }
  };
}

async function decideApproval(input: {
  approvalId: string;
  decision: "approved" | "rejected";
  reason?: string;
}): Promise<TaskCenterSnapshot> {
  if (!runtime) {
    throw new Error("Runtime not initialized.");
  }

  const approval = await runtime.stateRepository.decideApproval({
    approvalId: input.approvalId,
    decision: input.decision,
    reason: input.reason,
    approvedBy: "local-user"
  });
  const tasks = await runtime.stateRepository.listTasksByWorkspace(approval.workspaceId);
  const relatedTask = tasks.find((task) => task.id === approval.taskId);

  if (relatedTask) {
    let checkpointId = relatedTask.checkpointId;
    const workspace = runtime.workspaceService.getCurrentWorkspace();

    if (input.decision === "approved") {
      const affectedPaths =
        workspace?.gitSnapshot
          ? Array.from(
              new Set([
                ...workspace.gitSnapshot.conflicts,
                ...workspace.gitSnapshot.staged,
                ...workspace.gitSnapshot.unstaged,
                ...workspace.gitSnapshot.untracked
              ])
            )
          : [];
      const payloadPreview =
        workspace && affectedPaths.length > 0
          ? await runtime.stateRepository.writeCheckpointPayload({
              checkpointId: createId("checkpoint"),
              rootPath: workspace.rootPath,
              affectedPaths
            })
          : undefined;
      const checkpoint: CheckpointRecord = {
        id: payloadPreview?.checkpointId ?? createId("checkpoint"),
        sessionId: relatedTask.sessionId,
        workspaceId: approval.workspaceId,
        type: "approval-anchor",
        description: `Approval anchor for ${relatedTask.type}`,
        manifest: {
          approvalId: approval.id,
          taskId: relatedTask.id,
          decision: input.decision,
          reason: input.reason ?? null,
          rootPath: workspace?.rootPath,
          affectedPaths,
          git: workspace?.gitSnapshot
            ? {
                branch: workspace.gitSnapshot.branch,
                conflicts: workspace.gitSnapshot.conflicts.length,
                unstaged: workspace.gitSnapshot.unstaged.length,
                untracked: workspace.gitSnapshot.untracked.length
              }
            : undefined,
          payload: payloadPreview
            ? {
                manifestPath: payloadPreview.manifestPath,
                assetCount: payloadPreview.assetCount,
                assets: payloadPreview.assets.slice(0, 10)
              }
            : undefined
        },
        createdAt: Date.now()
      };
      await runtime.stateRepository.upsertCheckpoint(checkpoint);
      checkpointId = checkpoint.id;
    }

    await runtime.stateRepository.upsertTask({
      ...relatedTask,
      status: input.decision === "approved" ? "approved" : "rejected",
      checkpointId,
      updatedAt: Date.now(),
      resultJson:
        input.decision === "approved"
          ? `Approval accepted.${checkpointId ? ` Checkpoint ${checkpointId} created.` : ""}`
          : undefined,
      errorJson: input.decision === "rejected" ? input.reason ?? "Approval rejected." : undefined
    });
    await runtime.stateRepository.appendAuditRecord({
      entityType: "task",
      entityId: relatedTask.id,
      action: input.decision === "approved" ? "task.approved" : "task.rejected",
      detail: input.reason ?? approval.request.description,
      createdAt: Date.now()
    });

    await runtime.workspaceService.updateSessionSummary(
      approval.workspaceId,
      {
        lastTaskId: relatedTask.id,
        lastCheckpointId: checkpointId
      },
      relatedTask.id
    );
  }

  await runtime.stateRepository.appendAuditRecord({
    entityType: "approval",
    entityId: approval.id,
    action: `approval.${input.decision}`,
    detail: input.reason ?? approval.request.description,
    createdAt: Date.now()
  });
  await emitRuntimeEvent(runtime.eventBus, runtime.diagnostics, {
    type: EVENT_NAMES.approvalDecided,
    timestamp: Date.now(),
    payload: {
      approvalId: approval.id,
      decision: input.decision,
      workspaceId: approval.workspaceId
    }
  });

  return createTaskCenterSnapshot();
}

async function restoreCheckpoint(checkpointId: string): Promise<TaskCenterSnapshot> {
  if (!runtime) {
    throw new Error("Runtime not initialized.");
  }

  const currentWorkspace = runtime.workspaceService.getCurrentWorkspace();
  if (!currentWorkspace) {
    throw new Error("No active workspace.");
  }

  const checkpoint = await runtime.stateRepository.getLatestCheckpoint(currentWorkspace.id);
  if (!checkpoint || checkpoint.id !== checkpointId) {
    throw new Error("Checkpoint not found.");
  }

  const preview = await runtime.stateRepository.restoreCheckpointPayload(checkpointId);
  const session = await runtime.workspaceService.ensureSession(currentWorkspace.id);
  const now = Date.now();
  const restoreTask: TaskRecord = {
    id: createId("task"),
    workspaceId: currentWorkspace.id,
    sessionId: session.id,
    type: "checkpoint.restore",
    description: "Restore captured assets from the selected checkpoint.",
    status: "rolled-back",
    priority: "high",
    operations: [
      {
        kind: "checkpoint.restore",
        target: currentWorkspace.rootPath,
        params: {
          checkpointId
        },
        riskLevel: "medium",
        reversible: true
      }
    ],
    checkpointId,
    resultJson: `Restored ${preview?.assets.filter((asset) => asset.status === "captured").length ?? 0} captured files from ${checkpointId}.`,
    createdAt: now,
    updatedAt: now,
    completedAt: now
  };
  await runtime.stateRepository.upsertTask(restoreTask);
  await runtime.stateRepository.appendAuditRecord({
    entityType: "task",
    entityId: restoreTask.id,
    action: "task.rolled-back",
    detail: restoreTask.resultJson ?? checkpointId,
    createdAt: now
  });
  await runtime.workspaceService.updateSessionSummary(
    currentWorkspace.id,
    {
      lastTaskId: restoreTask.id,
      lastCheckpointId: checkpointId
    },
    restoreTask.id
  );
  await emitRuntimeEvent(runtime.eventBus, runtime.diagnostics, {
    type: EVENT_NAMES.taskUpserted,
    timestamp: now,
    payload: {
      workspaceId: currentWorkspace.id,
      taskId: restoreTask.id,
      status: restoreTask.status
    }
  });

  return createTaskCenterSnapshot();
}

function registerIpcHandlers(): void {
  ipcMain.handle("app:getInfo", async (): Promise<IpcResult<AppInfo>> => {
    try {
      return ok(createAppInfo());
    } catch (error) {
      const failure = toUserMessage(error);
      return err(failure.code, failure.message);
    }
  });

  ipcMain.handle("app:getHealth", async (): Promise<IpcResult<HealthSnapshot>> => {
    if (!runtime) {
      return err(ERROR_CODES.internal, "Runtime not initialized.");
    }
    return ok(createHealthSnapshot(runtime));
  });

  ipcMain.handle("app:getDiagnostics", async (): Promise<IpcResult<RuntimeDiagnosticsSnapshot>> => {
    if (!runtime) {
      return err(ERROR_CODES.internal, "Runtime not initialized.");
    }
    return ok(runtime.diagnostics);
  });

  ipcMain.handle("app:updatePreferences", async (_event, patch: AppPreferencePatch): Promise<IpcResult<AppInfo>> => {
    try {
      if (!runtime) {
        return err(ERROR_CODES.internal, "Runtime not initialized.");
      }

      runtime.config = applyConfigPatch(runtime.config, patch, nativeTheme.shouldUseDarkColors);
      await saveConfig(runtime.configDir, runtime.config);
      runtime.logger.info(
        `Preferences updated: language=${runtime.config.language}, themeMode=${runtime.config.themeMode}`,
        {
          language: runtime.config.language,
          themeMode: runtime.config.themeMode
        }
      );
      return ok(createAppInfo());
    } catch (error) {
      if (runtime) {
        void recordRuntimeError(runtime.errorReporter, runtime.diagnostics, runtime.logger, error, {
          surface: "app:updatePreferences"
        });
      }
      const failure = toUserMessage(error);
      return err(failure.code, failure.message);
    }
  });

  ipcMain.handle("workspace:listRecent", async () => {
    try {
      if (!runtime) {
        return err(ERROR_CODES.internal, "Runtime not initialized.");
      }
      return ok(await runtime.workspaceService.listRecent());
    } catch (error) {
      const failure = toUserMessage(error);
      return err(failure.code, failure.message);
    }
  });

  ipcMain.handle("workspace:open", async (_event, workspacePath: string) => {
    try {
      if (!runtime) {
        return err(ERROR_CODES.internal, "Runtime not initialized.");
      }
      const workspace = await runtime.workspaceService.open(workspacePath);
      await runtime.retrieval.startIndexing(workspace.id, workspace.rootPath);
      runtime.logger.info(`Workspace open request succeeded for ${workspace.rootPath}`);
      await emitRuntimeEvent(runtime.eventBus, runtime.diagnostics, {
        type: EVENT_NAMES.workspaceOpened,
        timestamp: Date.now(),
        payload: {
          workspaceId: workspace.id,
          rootPath: workspace.rootPath
        }
      });
      return ok(workspace);
    } catch (error) {
      if (runtime) {
        void recordRuntimeError(runtime.errorReporter, runtime.diagnostics, runtime.logger, error, {
          surface: "workspace:open",
          workspacePath
        });
      }
      const failure = toUserMessage(error);
      return err(failure.code, failure.message);
    }
  });

  ipcMain.handle("retrieval:getStatus", async () => {
    try {
      if (!runtime) {
        return err(ERROR_CODES.internal, "Runtime not initialized.");
      }

      const workspaceId = runtime.workspaceService.getCurrentWorkspaceId();
      const snapshot = await runtime.retrieval.getSnapshot(runtime.stateRepository, workspaceId);
      return ok(snapshot);
    } catch (error) {
      const failure = toUserMessage(error);
      return err(failure.code, failure.message);
    }
  });

  ipcMain.handle("task:getSnapshot", async (): Promise<IpcResult<TaskCenterSnapshot>> => {
    if (!runtime) {
      return err(ERROR_CODES.internal, "Runtime not initialized.");
    }
    try {
      return ok(await createTaskCenterSnapshot());
    } catch (error) {
      void recordRuntimeError(runtime.errorReporter, runtime.diagnostics, runtime.logger, error, {
        surface: "task:getSnapshot"
      });
      const failure = toUserMessage(error);
      return err(failure.code, failure.message);
    }
  });

  ipcMain.handle("task:getCheckpointPreview", async (_event, checkpointId: string): Promise<IpcResult<CheckpointPayloadPreview | undefined>> => {
    if (!runtime) {
      return err(ERROR_CODES.internal, "Runtime not initialized.");
    }
    try {
      return ok(await runtime.stateRepository.getCheckpointPayload(checkpointId));
    } catch (error) {
      void recordRuntimeError(runtime.errorReporter, runtime.diagnostics, runtime.logger, error, {
        surface: "task:getCheckpointPreview",
        checkpointId
      });
      const failure = toUserMessage(error);
      return err(failure.code, failure.message);
    }
  });

  ipcMain.handle("task:restoreCheckpoint", async (_event, checkpointId: string): Promise<IpcResult<TaskCenterSnapshot>> => {
    if (!runtime) {
      return err(ERROR_CODES.internal, "Runtime not initialized.");
    }
    try {
      return ok(await restoreCheckpoint(checkpointId));
    } catch (error) {
      void recordRuntimeError(runtime.errorReporter, runtime.diagnostics, runtime.logger, error, {
        surface: "task:restoreCheckpoint",
        checkpointId
      });
      const failure = toUserMessage(error);
      return err(failure.code, failure.message);
    }
  });

  ipcMain.handle(
    "task:decideApproval",
    async (
      _event,
      input: {
        approvalId: string;
        decision: "approved" | "rejected";
        reason?: string;
      }
    ): Promise<IpcResult<TaskCenterSnapshot>> => {
      if (!runtime) {
        return err(ERROR_CODES.internal, "Runtime not initialized.");
      }
      try {
        return ok(await decideApproval(input));
      } catch (error) {
        void recordRuntimeError(runtime.errorReporter, runtime.diagnostics, runtime.logger, error, {
          surface: "task:decideApproval",
          approvalId: input.approvalId
        });
        const failure = toUserMessage(error);
        return err(failure.code, failure.message);
      }
    }
  );
}

async function createWindow(): Promise<void> {
  if (!runtime) {
    throw new Error("Runtime not initialized.");
  }

  const windowState = runtime.workspaceService.getState().windowState;
  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    show: false,
    backgroundColor: "#0e1217",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("close", () => {
    if (!runtime || !mainWindow) {
      return;
    }
    const bounds = mainWindow.getBounds();
    void runtime.workspaceService.updateWindowState({
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMaximized: mainWindow.isMaximized()
    });
  });

  await mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
}

async function bootstrap(): Promise<void> {
  runtime = await createRuntime();
  registerIpcHandlers();
  await createWindow();
}

app.whenReady().then(() => {
  void bootstrap();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (runtime) {
    void emitRuntimeEvent(runtime.eventBus, runtime.diagnostics, {
      type: EVENT_NAMES.appShutdown,
      timestamp: Date.now(),
      payload: {
        version: APP_VERSION
      }
    });
    void markRuntimeStopped(runtime.lifecycleFilePath);
  }
  void runtime?.retrieval.shutdown();
  runtime?.stateRepository.close();
});
