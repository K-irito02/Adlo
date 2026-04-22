import fs from "node:fs/promises";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { app, BrowserWindow, ipcMain, nativeTheme, shell } from "electron";
import { AgentRuntimeService } from "@ai-digital-life/agent-runtime";
import { invalidateSessionSummaryL1 } from "@ai-digital-life/context-engine";
import { ChangeEngine } from "@ai-digital-life/change-engine";
import { applyConfigPatch, loadConfig, saveConfig } from "@ai-digital-life/config";
import { ConversationService } from "@ai-digital-life/conversation";
import { ErrorBoundary, ErrorReporter } from "@ai-digital-life/errors";
import { getGlobalEventBus, type EventBus } from "@ai-digital-life/events";
import { WorkspaceFsService, WorkspaceWatcherService } from "@ai-digital-life/fs-ops";
import { createApprovalRequest, shouldRequireApproval } from "@ai-digital-life/task";
import {
  APP_NAME,
  APP_VERSION,
  type CommandExecutionResult,
  type CommandRunResult,
  type CommandRunStreamStart,
  type CommandRequest,
  type DigitalLifeTerminalStreamEventV1,
  ERROR_CODES,
  EVENT_NAMES,
  type AgentRunDetail,
  type AppInfo,
  type AppPreferencePatch,
  APPROVAL_POLICY_MODE,
  type ApprovalRecord,
  type ApprovalRequestSummary,
  type BaseEvent,
  type CheckpointRecord,
  type CheckpointPayloadPreview,
  type ConfigSnapshot,
  type ConversationMessageRecord,
  type ConversationSendResult,
  type ConversationSessionRecord,
  type EventDiagnostics,
  type FileOutlineItem,
  type HealthSnapshot,
  type IpcResult,
  type LogEntrySummary,
  type ModelCallAuditRecord,
  type ModelGatewayHealthSnapshot,
  type ModelResponse,
  type ModelTokenUsage,
  type ModelProviderId,
  type PatchApplicationResult,
  type PatchSet,
  type RecentWorkspaceEntry,
  type RetrievalSnapshot,
  type ReorderSessionsInput,
  type ReorderWorkspacesInput,
  type RuntimeDiagnosticsSnapshot,
  type RuntimeLifecycleSnapshot,
  type RiskLevel,
  type TaskOperation,
  type TaskRecord,
  type TaskCenterSnapshot,
  type TaskStatus,
  type ValidationResult,
  type WorkspaceFileDocument,
  type WorkspaceTreeNode,
  type WorkspaceSearchHit,
  ok,
  err,
  createId,
  toUserMessage
} from "@ai-digital-life/kernel";
import { createLoggerFactory, type Logger } from "@ai-digital-life/logger";
import { ModelGateway } from "@ai-digital-life/model-gateway";
import {
  BackupManager,
  MigrationRegistry,
  MigrationRunner,
  registerDefaultMigrations,
  VersionDetector,
  parseVersion
} from "@ai-digital-life/migration";
import { StateRepository } from "@ai-digital-life/storage";
import {
  TerminalService,
  analyzeRetryDisposition,
  buildValidationResult,
  classifyCommandProfile,
  detectWorkspaceValidationCommand,
  type RetryAttemptSummary
} from "@ai-digital-life/terminal";
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
  fsOps: WorkspaceFsService;
  workspaceWatcher: WorkspaceWatcherService;
  changeEngine: ChangeEngine;
  conversationService: ConversationService;
  agentRuntime: AgentRuntimeService;
  modelGateway: ModelGateway;
  modelHealthSnapshot?: ModelGatewayHealthSnapshot;
  terminalService: TerminalService;
  /** Relative paths reported by the renderer as having unsaved edits (best-effort). */
  dirtyEditorPaths: Set<string>;
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

/** In-flight model streams keyed by agent run id (Main-only). */
const runStreamAbortControllers = new Map<string, AbortController>();

/** Terminal stream runs: execution id → abort (Main-only). */
const terminalStreamAbortControllers = new Map<string, AbortController>();

function broadcastModelStreamEvent(
  event: import("@ai-digital-life/kernel").DigitalLifeModelStreamEventV1
): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send("digitalLife:modelStream", event);
}

function broadcastTerminalStreamEvent(event: DigitalLifeTerminalStreamEventV1): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send("digitalLife:terminalStream", event);
}
let runtime: Runtime | null = null;

async function startWorkspaceWatcher(runtimeState: Runtime, rootPath: string): Promise<void> {
  await runtimeState.workspaceWatcher.watch(rootPath, async (event) => {
    const workspace = runtimeState.workspaceService.getCurrentWorkspace();
    if (workspace) {
      invalidateSessionSummaryL1(workspace.id);
      await runtimeState.stateRepository.invalidateContextSummaryForWorkspace(workspace.id);
    }
    mainWindow?.webContents.send("workspace:fileChanged", event);
  });
}

async function recoverWorkspaceExecutionState(runtimeState: Runtime, workspaceId: string): Promise<void> {
  if (!runtimeState.diagnostics.lifecycle.recoveredFromCrash) {
    return;
  }

  const now = Date.now();
  const interruptedTaskStatuses = new Set<TaskStatus>(["running", "approved"]);
  const interruptedRunStatuses = new Set<AgentRunDetail["run"]["status"]>([
    "planning",
    "ready",
    "executing",
    "waiting-approval",
    "applying",
    "verifying"
  ]);

  const tasks = await runtimeState.stateRepository.listTasksByWorkspace(workspaceId);
  for (const task of tasks) {
    if (interruptedTaskStatuses.has(task.status)) {
      await runtimeState.stateRepository.upsertTask({
        ...task,
        status: "failed",
        updatedAt: now,
        completedAt: now,
        resultJson: undefined,
        errorJson: "Recovered after a previous unclean shutdown. Retry this task to continue."
      });
      await runtimeState.stateRepository.appendAuditRecord({
        entityType: "task",
        entityId: task.id,
        action: "task.recovered-interrupted",
        detail: `Recovered ${task.type} from status ${task.status}.`,
        createdAt: now
      });
      continue;
    }

    if (task.status === "waiting-approval") {
      await runtimeState.stateRepository.appendAuditRecord({
        entityType: "task",
        entityId: task.id,
        action: "task.recovered-waiting-approval",
        detail: `Recovered ${task.type} still waiting for approval.`,
        createdAt: now
      });
    }
  }

  const patchSets = await runtimeState.stateRepository.listPatchSetsByWorkspace(workspaceId);
  for (const patchSet of patchSets) {
    if (patchSet.status !== "applying") {
      continue;
    }

    await runtimeState.stateRepository.upsertPatchSet({
      ...patchSet,
      status: "failed",
      summary: `${patchSet.summary} Recovered after an interrupted apply/validate cycle.`,
      updatedAt: now
    });
    await runtimeState.stateRepository.appendAuditRecord({
      entityType: "session",
      entityId: patchSet.sessionId,
      action: "patch.recovered-interrupted",
      detail: `Recovered patch set ${patchSet.id} from applying state.`,
      createdAt: now
    });
  }

  const agentRuns = await runtimeState.stateRepository.listAgentRunsByWorkspace(workspaceId);
  for (const run of agentRuns) {
    if (!interruptedRunStatuses.has(run.status)) {
      continue;
    }

    await runtimeState.stateRepository.upsertAgentRun({
      ...run,
      status: "failed",
      summary: "Recovered after a previous unclean shutdown. Retry from the conversation to continue.",
      updatedAt: now,
      completedAt: now
    });
    await runtimeState.stateRepository.appendAuditRecord({
      entityType: "session",
      entityId: run.sessionId,
      action: "agent-run.recovered-interrupted",
      detail: `Recovered run ${run.id} from status ${run.status}.`,
      createdAt: now
    });
  }
}

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
  const modelChecks = runtimeState.modelHealthSnapshot?.providers ?? [];
  const modelStatus =
    modelChecks.length === 0
      ? "degraded"
      : modelChecks.every((provider) => provider.healthy)
        ? "healthy"
        : modelChecks.some((provider) => provider.healthy)
          ? "degraded"
          : "unavailable";
  const modelDetail =
    modelChecks.length === 0
      ? "Model providers have not been checked yet."
      : modelChecks.map((provider) => `${provider.providerId}:${provider.healthy ? "ok" : "fail"}`).join(", ");

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
      },
      {
        name: "models",
        status: modelStatus,
        detail: modelDetail,
        updatedAt: runtimeState.modelHealthSnapshot?.checkedAt ?? runtimeState.diagnostics.lifecycle.currentStartedAt
      }
    ]
  };
}

function createModelGateway(config: ConfigSnapshot): ModelGateway {
  return new ModelGateway({
    providerPreferences: config.modelPreferences.providers
  });
}

function createAgentRuntime(stateRepository: StateRepository, modelGateway: ModelGateway): AgentRuntimeService {
  return new AgentRuntimeService(stateRepository, {
    modelGateway
  });
}

async function refreshModelHealthSnapshot(runtimeState: Runtime): Promise<ModelGatewayHealthSnapshot> {
  const snapshot = await runtimeState.modelGateway.getHealthSnapshot();
  runtimeState.modelHealthSnapshot = snapshot;
  return snapshot;
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
  const fsOps = new WorkspaceFsService();
  const workspaceWatcher = new WorkspaceWatcherService();
  const changeEngine = new ChangeEngine(fsOps);
  const conversationService = new ConversationService(stateRepository);
  const modelGateway = createModelGateway(config);
  const agentRuntime = createAgentRuntime(stateRepository, modelGateway);
  const terminalService = new TerminalService(loggerFactory.createLogger("terminal"));
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
    const bootstrapRuntime = {
      configDir,
      lifecycleFilePath,
      config,
      logger,
      errorReporter,
      eventBus,
      diagnostics,
      stateRepository,
      workspaceService,
      fsOps,
      workspaceWatcher,
      changeEngine,
      conversationService,
      agentRuntime,
      modelGateway,
      terminalService,
      dirtyEditorPaths: new Set<string>(),
      getRecentLogs: loggerFactory.getRecentEntries,
      retrieval
    } satisfies Runtime;
    await startWorkspaceWatcher(bootstrapRuntime, currentWorkspace.rootPath);
    await recoverWorkspaceExecutionState(bootstrapRuntime, currentWorkspace.id);
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
    fsOps,
    workspaceWatcher,
    changeEngine,
    conversationService,
    agentRuntime,
    modelGateway,
    terminalService,
    dirtyEditorPaths: new Set<string>(),
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

function requireRuntime(): Runtime {
  if (!runtime) {
    throw new Error("Runtime not initialized.");
  }
  return runtime;
}

function requireCurrentWorkspaceState(): { workspaceId: string; workspaceRoot: string } {
  const runtimeState = requireRuntime();
  const workspace = runtimeState.workspaceService.getCurrentWorkspace();
  if (!workspace) {
    throw new Error("No active workspace.");
  }

  return {
    workspaceId: workspace.id,
    workspaceRoot: workspace.rootPath
  };
}

async function getOrCreateConversationSession(title?: string): Promise<ConversationSessionRecord> {
  const runtimeState = requireRuntime();
  const { workspaceId } = requireCurrentWorkspaceState();
  const existing = await runtimeState.stateRepository.listConversationSessions(workspaceId);
  if (existing[0]) {
    return existing[0];
  }
  return runtimeState.conversationService.createSession(workspaceId, title ? title.trim() : "Single Agent Session");
}

function parseSlashCommand(content: string): { command: string; args: string } | undefined {
  const trimmed = content.trim();
  if (!trimmed.startsWith("/")) {
    return undefined;
  }
  const space = trimmed.indexOf(" ");
  if (space < 0) {
    return { command: trimmed.slice(1).toLowerCase(), args: "" };
  }
  return { command: trimmed.slice(1, space).toLowerCase(), args: trimmed.slice(space + 1).trim() };
}

async function handleSlashConversationTurn(input: {
  sessionId: string;
  workspaceId: string;
  workspaceRoot: string;
  userMessage: ConversationMessageRecord;
  slash: { command: string; args: string };
}): Promise<ConversationSendResult> {
  const runtimeState = requireRuntime();
  const runId = createId("run");
  const now = Date.now();
  const baseRun = {
    id: runId,
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    prompt: `${input.slash.command} ${input.slash.args}`.trim(),
    scenario: "chat" as const,
    status: "succeeded" as const,
    createdAt: now,
    updatedAt: now,
    completedAt: now,
    summary: "slash"
  };
  await runtimeState.stateRepository.upsertAgentRun(baseRun);
  await runtimeState.stateRepository.replaceAgentSteps(runId, []);

  let assistantBody = "";

  switch (input.slash.command) {
    case "help":
      assistantBody = [
        "## Slash 命令",
        "",
        "- `/help` 显示本帮助",
        "- `/clear` 清空当前会话消息",
        "- `/run <command> [args...]` 通过治理与审批执行命令（与命令面板一致）",
        "",
        "引用：`@path`、`@file:path`、`@symbol:Name`、`@terminal:last` 会被拼入模型上下文。"
      ].join("\n");
      break;
    case "clear":
      await runtimeState.conversationService.clearMessages(input.sessionId);
      invalidateSessionSummaryL1(input.workspaceId);
      await runtimeState.stateRepository.invalidateContextSummaryForWorkspace(input.workspaceId);
      assistantBody = "已清空当前会话消息，并丢弃本地上下文摘要缓存。";
      break;
    case "run": {
      const parts = input.slash.args.trim().split(/\s+/).filter(Boolean);
      if (!parts[0]) {
        assistantBody = "用法：`/run <command> [args...]`";
        break;
      }
      const command = parts[0];
      const args = parts.slice(1);
      const cmdResult = await executeGovernedCommand({ command, args, shell: false });
      assistantBody = [
        `命令：${command} ${args.join(" ")}`.trim(),
        `状态：${cmdResult.status}`,
        cmdResult.result
          ? `退出码：${cmdResult.result.exitCode}\n摘要：${cmdResult.result.summary}`
          : "结果：等待审批或尚未执行。",
        cmdResult.approvalRequest ? `审批：${cmdResult.approvalRequest.title}` : ""
      ]
        .filter(Boolean)
        .join("\n");
      break;
    }
    default:
      assistantBody = `未知命令 \`/${input.slash.command}\`。输入 \`/help\` 查看列表。`;
  }

  const assistantMessage = await runtimeState.conversationService.addMessage({
    sessionId: input.sessionId,
    role: "assistant",
    content: assistantBody,
    blocks: [],
    runId
  });

  const detail = await runtimeState.stateRepository.getConversationDetail(input.sessionId);
  if (!detail) {
    throw new Error("Conversation session not found after slash handling.");
  }

  return {
    session: detail.session,
    userMessage: input.userMessage,
    assistantMessage,
    runDetail: {
      run: baseRun,
      steps: []
    },
    patchSet: undefined
  };
}

async function executeConversationRun(input: {
  sessionId: string;
  content: string;
  scenario?: "chat" | "plan" | "code-edit";
}): Promise<ConversationSendResult> {
  const runtimeState = requireRuntime();
  const { workspaceId, workspaceRoot } = requireCurrentWorkspaceState();
  const userMessage = await runtimeState.conversationService.addMessage({
    sessionId: input.sessionId,
    role: "user",
    content: input.content
  });

  const slash = parseSlashCommand(input.content);
  if (slash) {
    return handleSlashConversationTurn({
      sessionId: input.sessionId,
      workspaceId,
      workspaceRoot,
      userMessage,
      slash
    });
  }

  const bootstrap = await runtimeState.agentRuntime.prepareAgentRun({
    workspaceId,
    sessionId: input.sessionId,
    workspaceRoot,
    prompt: input.content,
    scenario: input.scenario
  });

  const abortController = new AbortController();
  runStreamAbortControllers.set(bootstrap.run.id, abortController);

  const streamStartedAt = Date.now();
  let aggregatedText = "";
  const streamErrors: string[] = [];
  let lastUsage: ModelTokenUsage | undefined;
  let lastRoute: { providerId: ModelProviderId; modelId: string } | undefined;
  const routeChain: string[] = [];

  try {
    try {
      for await (const event of runtimeState.modelGateway.generateResponseStream({
        scenario: bootstrap.scenario,
        prompt: bootstrap.promptText,
        contextSummary: bootstrap.contextSummary,
        runId: bootstrap.run.id,
        workspaceId,
        sessionId: input.sessionId,
        signal: abortController.signal
      })) {
        broadcastModelStreamEvent(event);
        switch (event.type) {
          case "delta":
            aggregatedText += event.text;
            break;
          case "usage":
            lastUsage = event.usage;
            break;
          case "route":
            lastRoute = { providerId: event.providerId, modelId: event.modelId };
            routeChain.push(`${event.providerId}:${event.modelId}`);
            break;
          case "error":
            streamErrors.push(event.message);
            break;
          default:
            break;
        }
      }
    } catch (error) {
      if (!abortController.signal.aborted) {
        throw error;
      }
    }
  } finally {
    runStreamAbortControllers.delete(bootstrap.run.id);
  }

  const latencyMs = Date.now() - streamStartedAt;
  const wasAborted = abortController.signal.aborted;
  const trimmed = aggregatedText.trim();
  const fallbackBody =
    trimmed.length > 0
      ? aggregatedText
      : streamErrors.length > 0
        ? streamErrors.join("\n\n")
        : "（模型未返回可见文本。）";

  const modelResponse: ModelResponse = {
    providerId: lastRoute?.providerId ?? "deepseek",
    modelId: lastRoute?.modelId ?? runtimeState.modelGateway.listProviders()[0]?.modelId ?? "deepseek-chat",
    synthetic: Boolean(!trimmed.length && streamErrors.length > 0),
    content: wasAborted && trimmed.length > 0 ? `${aggregatedText}\n\n（生成已由用户取消。）` : wasAborted ? "（生成已由用户取消。）" : fallbackBody,
    requestId: createId("mreq"),
    usage:
      lastUsage ??
      ({
        estimated: true,
        promptTokens: Math.max(1, Math.ceil((bootstrap.promptText.length + bootstrap.contextSummary.length) / 4)),
        completionTokens: Math.max(1, Math.ceil(fallbackBody.length / 4))
      } satisfies ModelTokenUsage),
    route: {
      reason: wasAborted ? "aborted" : streamErrors.length && !trimmed ? "stream_failed" : "stream_completed",
      chain: routeChain.length > 0 ? routeChain : ["unrouted"],
      synthetic: Boolean(!trimmed.length && streamErrors.length > 0)
    }
  };

  const execution = await runtimeState.agentRuntime.completeAgentRunWithModelResponse(bootstrap, modelResponse);

  if (wasAborted) {
    const abortedRun = {
      ...execution.runDetail.run,
      status: "aborted" as const,
      updatedAt: Date.now(),
      completedAt: Date.now(),
      summary: "User cancelled model generation."
    };
    await runtimeState.stateRepository.upsertAgentRun(abortedRun);
    execution.runDetail.run = abortedRun;
  }

  const audit: ModelCallAuditRecord = {
    id: createId("mcaudit"),
    requestId: modelResponse.requestId ?? createId("mreq"),
    workspaceId,
    sessionId: input.sessionId,
    runId: bootstrap.run.id,
    providerId: modelResponse.providerId,
    modelId: modelResponse.modelId,
    scenario: bootstrap.scenario,
    routeMeta: modelResponse.route ?? { reason: "unknown", chain: [] },
    promptTokens: modelResponse.usage?.promptTokens ?? null,
    completionTokens: modelResponse.usage?.completionTokens ?? null,
    latencyMs,
    error: streamErrors.length ? streamErrors.join(" | ").slice(0, 2000) : wasAborted ? "aborted" : undefined,
    streamed: true,
    createdAt: Date.now()
  };
  try {
    await runtimeState.stateRepository.insertModelCallAudit(audit);
  } catch (error) {
    runtimeState.logger.warn("model_call_audit insert failed", {
      error: error instanceof Error ? error.message : String(error)
    });
  }

  const assistantMessage = await runtimeState.conversationService.addMessage({
    sessionId: input.sessionId,
    role: "assistant",
    content: execution.assistantContent,
    blocks: execution.assistantBlocks,
    runId: execution.runDetail.run.id
  });
  const detail = await runtimeState.stateRepository.getConversationDetail(input.sessionId);
  if (!detail) {
    throw new Error("Conversation session not found after execution.");
  }

  return {
    session: detail.session,
    userMessage,
    assistantMessage,
    runDetail: execution.runDetail,
    patchSet: execution.patchSet
  };
}

async function recordValidationConversationMessage(input: {
  sessionId: string;
  runId?: string;
  patchSetId: string;
  commandLabel?: string;
  validation?: ValidationResult;
  rolledBack: boolean;
  repairPatchSet?: PatchSet;
}): Promise<void> {
  const runtimeState = requireRuntime();
  const blocks: import("@ai-digital-life/kernel").ConversationBlock[] = [];

  if (input.commandLabel) {
    const toolStatus: "completed" | "failed" = input.validation?.status === "failed" ? "failed" : "completed";
    blocks.push({
      id: createId("block"),
      type: "tool-call" as const,
      toolName: "terminal.run",
      summary: input.commandLabel,
      status: toolStatus
    });
  }

  if (input.validation) {
    blocks.push({
      id: createId("block"),
      type: "validation-result" as const,
      summary: input.validation.summary,
      status: input.validation.status,
      diagnostics: input.validation.diagnostics
    });
  }

  blocks.push({
    id: createId("block"),
    type: "final-summary" as const,
    summary: input.rolledBack
      ? "补丁已应用，但验证失败并已自动回滚。"
      : "补丁已应用并完成验证。"
  });

  if (input.repairPatchSet) {
    blocks.push({
      id: createId("block"),
      type: "patch-summary" as const,
      patchSetId: input.repairPatchSet.id,
      summary: input.repairPatchSet.summary,
      fileCount: input.repairPatchSet.filePatches.length,
      hunkCount: input.repairPatchSet.filePatches.reduce((total, filePatch) => total + filePatch.hunks.length, 0)
    });
  }

  await runtimeState.conversationService.addMessage({
    sessionId: input.sessionId,
    role: "assistant",
    content: input.repairPatchSet
      ? "Validation failed, the patch was rolled back, and a repair preview was prepared."
      : input.rolledBack
        ? "Validation failed and the patch was rolled back."
        : "Patch applied and validation completed.",
    blocks,
    runId: input.runId
  });
}

function stringifyRetryAttempts(attempts: RetryAttemptSummary[]): string {
  return attempts
    .map((attempt) => `#${attempt.attempt}:${attempt.success ? "ok" : "failed"}:${attempt.reason}`)
    .join(" | ");
}

async function applyPatchAndValidate(patchSetId: string): Promise<PatchApplicationResult> {
  const runtimeState = requireRuntime();
  const { workspaceRoot } = requireCurrentWorkspaceState();
  const workspace = runtimeState.workspaceService.getCurrentWorkspace();
  if (!workspace) {
    throw new Error("No active workspace.");
  }

  const patchSet = await runtimeState.stateRepository.getPatchSet(patchSetId);
  if (!patchSet) {
    throw new Error("Patch set not found.");
  }

  const affectedPaths = patchSet.filePatches.map((filePatch) => filePatch.relativePath);
  const checkpointPreview = await runtimeState.stateRepository.writeCheckpointPayload({
    checkpointId: createId("checkpoint"),
    rootPath: workspaceRoot,
    affectedPaths
  });
  const checkpoint: CheckpointRecord = {
    id: checkpointPreview.checkpointId,
    sessionId: patchSet.sessionId,
    workspaceId: patchSet.workspaceId,
    type: "approval-anchor",
    description: `Patch apply checkpoint for ${patchSet.title}`,
    manifest: {
      patchSetId: patchSet.id,
      rootPath: workspaceRoot,
      affectedPaths
    },
    createdAt: Date.now()
  };
  await runtimeState.stateRepository.upsertCheckpoint(checkpoint);

  const applyingPatchSet = {
    ...patchSet,
    checkpointId: checkpoint.id,
    status: "applying" as const,
    updatedAt: Date.now()
  };
  await runtimeState.stateRepository.upsertPatchSet(applyingPatchSet);

  let runDetail = patchSet.runId ? await runtimeState.stateRepository.getAgentRunDetail(patchSet.runId) : undefined;
  if (runDetail) {
    await runtimeState.stateRepository.upsertAgentRun({
      ...runDetail.run,
      status: "applying",
      updatedAt: Date.now()
    });
  }

  const precondition = await runtimeState.changeEngine.assertPatchApplies(
    applyingPatchSet,
    workspaceRoot,
    runtimeState.dirtyEditorPaths
  );
  if (!precondition.ok) {
    throw new Error(
      `Patch apply blocked (${precondition.reason})${precondition.relativePath ? `: ${precondition.relativePath}` : ""}`
    );
  }

  const applied = await runtimeState.changeEngine.applyPatchSet(workspaceRoot, applyingPatchSet);
  await runtimeState.stateRepository.upsertPatchSet(applied);

  const validationCommand = detectWorkspaceValidationCommand(workspaceRoot, workspace.type);
  if (!validationCommand) {
    if (runDetail) {
      await runtimeState.stateRepository.upsertAgentRun({
        ...runDetail.run,
        status: "succeeded",
        updatedAt: Date.now(),
        completedAt: Date.now()
      });
    }
    await recordValidationConversationMessage({
      sessionId: patchSet.sessionId,
      runId: patchSet.runId,
      patchSetId: patchSet.id,
      rolledBack: false
    });
    return {
      patchSet: applied,
      rolledBack: false
    };
  }

  const commandRequest: CommandRequest = {
    id: createId("command"),
    workspaceId: patchSet.workspaceId,
    runId: patchSet.runId,
    profile: validationCommand.profile,
    command: validationCommand.command,
    args: validationCommand.args,
    shell: false,
    riskLevel: "low",
    createdAt: Date.now()
  };
  await runtimeState.stateRepository.insertCommandExecution(commandRequest);
  if (patchSet.runId) {
    await runtimeState.stateRepository.upsertToolInvocation({
      id: createId("tool"),
      runId: patchSet.runId,
      toolName: "terminal.run",
      summary: `${commandRequest.command} ${commandRequest.args.join(" ")}`,
      status: "completed",
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  }

  if (runDetail) {
    await runtimeState.stateRepository.upsertAgentRun({
      ...runDetail.run,
      status: "verifying",
      updatedAt: Date.now()
    });
  }

  const retryExecution = await runtimeState.terminalService.executeWithRetries(commandRequest, workspaceRoot, {
    maxAttempts: 3,
    baseDelayMs: 300
  });
  const commandResult = retryExecution.result;
  const validation = buildValidationResult({
    workspaceId: patchSet.workspaceId,
    runId: patchSet.runId,
    patchSetId: patchSet.id,
    commandResult
  });
  await runtimeState.stateRepository.insertValidationResult(validation);
  await runtimeState.stateRepository.appendAuditRecord({
    entityType: "session",
    entityId: patchSet.sessionId,
    action: "validation.retried",
    detail: stringifyRetryAttempts(retryExecution.attempts),
    createdAt: Date.now()
  });

  if (!commandResult.success) {
    const rolledBack = await runtimeState.changeEngine.rollbackPatchSet(workspaceRoot, applied);
    await runtimeState.stateRepository.upsertPatchSet(rolledBack);
    const maxRepairRounds = 2;
    let repairPatchSet: PatchSet | undefined;
    let rollingValidation: ValidationResult = validation;
    if (patchSet.runId) {
      for (let round = 0; round < maxRepairRounds; round += 1) {
        const repairResult = await runtimeState.agentRuntime.startRepairRun({
          workspaceId: patchSet.workspaceId,
          sessionId: patchSet.sessionId,
          workspaceRoot,
          failedPatchSet: rolledBack,
          validation: rollingValidation
        });
        if (!repairResult?.patchSet) {
          break;
        }
        repairPatchSet = repairResult.patchSet;
        if (round < maxRepairRounds - 1) {
          rollingValidation = {
            ...rollingValidation,
            diagnostics: [
              ...rollingValidation.diagnostics,
              {
                id: createId("diag"),
                source: "system",
                severity: "info",
                message: `Prior repair model output (round ${round + 1}): ${repairResult.assistantContent.slice(0, 1200)}`
              }
            ]
          };
        }
      }
    }
    if (runDetail) {
      await runtimeState.stateRepository.upsertAgentRun({
        ...runDetail.run,
        status: "rolled-back",
        summary: validation.summary,
        updatedAt: Date.now(),
        completedAt: Date.now()
      });
    }
    await recordValidationConversationMessage({
      sessionId: patchSet.sessionId,
      runId: patchSet.runId,
      patchSetId: patchSet.id,
      commandLabel: `${commandRequest.command} ${commandRequest.args.join(" ")}`,
      validation,
      rolledBack: true,
      repairPatchSet
    });
    if (repairPatchSet) {
      await runtimeState.stateRepository.appendAuditRecord({
        entityType: "session",
        entityId: patchSet.sessionId,
        action: "repair-preview.generated",
        detail: `Generated repair patch set ${repairPatchSet.id} after validation failure.`,
        createdAt: Date.now()
      });
    }
    return {
      patchSet: rolledBack,
      validation,
      commandResult,
      rolledBack: true,
      repairPatchSet
    };
  }

  if (runDetail) {
    await runtimeState.stateRepository.upsertAgentRun({
      ...runDetail.run,
      status: "succeeded",
      summary: validation.summary,
      updatedAt: Date.now(),
      completedAt: Date.now()
    });
  }
  await recordValidationConversationMessage({
    sessionId: patchSet.sessionId,
    runId: patchSet.runId,
    patchSetId: patchSet.id,
    commandLabel: `${commandRequest.command} ${commandRequest.args.join(" ")}`,
    validation,
    rolledBack: false
  });
  return {
    patchSet: applied,
    validation,
    commandResult,
    rolledBack: false
  };
}

function createCommandTaskOperation(request: CommandRequest): TaskOperation {
  return {
    kind: "terminal.run",
    target: request.command,
    params: {
      requestId: request.id,
      command: request.command,
      args: request.args,
      shell: request.shell,
      profile: request.profile
    },
    riskLevel: request.riskLevel,
    reversible: true
  };
}

function restoreCommandRequestFromTask(task: TaskRecord): CommandRequest {
  const operation = task.operations.find((item) => item.kind === "terminal.run");
  if (!operation) {
    throw new Error("Command operation metadata not found.");
  }

  return {
    id: String(operation.params.requestId ?? createId("command")),
    workspaceId: task.workspaceId,
    runId: undefined,
    profile: operation.params.profile as CommandRequest["profile"],
    command: String(operation.params.command ?? operation.target ?? ""),
    args: Array.isArray(operation.params.args) ? operation.params.args.map((value) => String(value)) : [],
    shell: Boolean(operation.params.shell),
    riskLevel: operation.riskLevel,
    createdAt: task.startedAt ?? task.createdAt
  };
}

async function runCommandTask(task: TaskRecord, request: CommandRequest): Promise<CommandExecutionResult> {
  if (!runtime) {
    throw new Error("Runtime not initialized.");
  }

  const workspace = runtime.workspaceService.getCurrentWorkspace();
  if (!workspace || workspace.id !== task.workspaceId) {
    throw new Error("The task workspace is not active.");
  }

  await runtime.stateRepository.upsertTask({
    ...task,
    status: "running",
    startedAt: task.startedAt ?? Date.now(),
    updatedAt: Date.now(),
    resultJson: undefined,
    errorJson: undefined
  });
  await runtime.stateRepository.insertCommandExecution(request);
  const retryExecution = await runtime.terminalService.executeWithRetries(request, workspace.rootPath, {
    maxAttempts: request.riskLevel === "low" ? 2 : 3,
    baseDelayMs: 250
  });
  const commandResult = retryExecution.result;

  await runtime.stateRepository.upsertTask({
    ...task,
    status: commandResult.success ? "completed" : "failed",
    startedAt: task.startedAt ?? Date.now(),
    updatedAt: Date.now(),
    completedAt: commandResult.completedAt,
    resultJson: commandResult.success ? commandResult.summary : undefined,
    errorJson: commandResult.success ? undefined : commandResult.summary
  });
  await runtime.stateRepository.appendAuditRecord({
    entityType: "task",
    entityId: task.id,
    action: commandResult.success ? "task.completed" : "task.failed",
    detail: commandResult.summary,
    createdAt: Date.now()
  });
  await runtime.stateRepository.appendAuditRecord({
    entityType: "task",
    entityId: task.id,
    action: "task.retry-summary",
    detail: stringifyRetryAttempts(retryExecution.attempts),
    createdAt: Date.now()
  });
  await runtime.workspaceService.updateSessionSummary(
    task.workspaceId,
    {
      lastTaskId: task.id
    },
    task.id
  );
  return commandResult;
}

type PreparedGovernedCommand =
  | {
      kind: "approval";
      runResult: CommandRunResult;
    }
  | {
      kind: "ready";
      task: TaskRecord;
      request: CommandRequest;
    };

async function prepareGovernedCommand(input: {
  command: string;
  args: string[];
  shell?: boolean;
}): Promise<PreparedGovernedCommand> {
  if (!runtime) {
    throw new Error("Runtime not initialized.");
  }

  const workspace = runtime.workspaceService.getCurrentWorkspace();
  if (!workspace) {
    throw new Error("No active workspace.");
  }

  const session = await runtime.workspaceService.ensureSession(workspace.id);
  const classification = classifyCommandProfile(`${input.command} ${input.args.join(" ")}`);
  const request: CommandRequest = {
    id: createId("command"),
    workspaceId: workspace.id,
    profile: classification.profile,
    command: input.command,
    args: input.args,
    shell: input.shell ?? false,
    riskLevel: input.shell ? "high" : classification.riskLevel,
    createdAt: Date.now()
  };
  const operations = [createCommandTaskOperation(request)];
  const now = Date.now();
  const task: TaskRecord = {
    id: createId("task"),
    workspaceId: workspace.id,
    sessionId: session.id,
    type: "command.run",
    description: `Execute ${request.command} ${request.args.join(" ")}`.trim(),
    status: shouldRequireApproval(operations) ? "waiting-approval" : "running",
    priority: request.riskLevel === "high" ? "high" : "medium",
    operations,
    createdAt: now,
    updatedAt: now,
    startedAt: now
  };

  if (shouldRequireApproval(operations)) {
    const approvalRequest = createApprovalRequest({
      taskId: task.id,
      title: `command.${request.profile}`,
      description: `Command ${request.command} ${request.args.join(" ")} requires approval before execution.`,
      operations,
      impact: [
        "This command may modify the workspace or dependency graph.",
        "Execution is paused until the approval is resolved."
      ],
      createdAt: now
    });
    const approval: ApprovalRecord = {
      id: approvalRequest.id,
      taskId: task.id,
      workspaceId: workspace.id,
      riskLevel: approvalRequest.riskLevel,
      request: approvalRequest,
      createdAt: now,
      expiresAt: now + 15 * 60 * 1000
    };
    await runtime.stateRepository.upsertApproval(approval);
    await runtime.stateRepository.upsertTask({
      ...task,
      approvalId: approval.id
    });
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
        taskId: task.id
      }
    });
    return {
      kind: "approval",
      runResult: {
        status: "waiting-approval",
        taskId: task.id,
        request,
        approvalRequest
      }
    };
  }

  await runtime.stateRepository.upsertTask(task);
  return { kind: "ready", task, request };
}

async function executeGovernedCommand(input: {
  command: string;
  args: string[];
  shell?: boolean;
}): Promise<CommandRunResult> {
  const prepared = await prepareGovernedCommand(input);
  if (prepared.kind === "approval") {
    return prepared.runResult;
  }
  const result = await runCommandTask(prepared.task, prepared.request);
  return {
    status: "completed",
    taskId: prepared.task.id,
    request: prepared.request,
    result
  };
}

async function runCommandTaskStream(
  task: TaskRecord,
  request: CommandRequest,
  executionId: string,
  signal: AbortSignal
): Promise<void> {
  if (!runtime) {
    return;
  }

  const workspace = runtime.workspaceService.getCurrentWorkspace();
  if (!workspace || workspace.id !== task.workspaceId) {
    broadcastTerminalStreamEvent({
      v: 1,
      executionId,
      seq: 1,
      type: "error",
      message: "The task workspace is not active."
    });
    broadcastTerminalStreamEvent({
      v: 1,
      executionId,
      seq: 2,
      type: "done",
      exitCode: null,
      success: false,
      summary: "Workspace not active."
    });
    terminalStreamAbortControllers.delete(executionId);
    return;
  }

  let seq = 0;
  const bump = (): number => {
    seq += 1;
    return seq;
  };

  try {
    await runtime.stateRepository.upsertTask({
      ...task,
      status: "running",
      startedAt: task.startedAt ?? Date.now(),
      updatedAt: Date.now(),
      resultJson: undefined,
      errorJson: undefined
    });
    await runtime.stateRepository.insertCommandExecution(request);

    const commandResult = await runtime.terminalService.executeStream(request, workspace.rootPath, {
      signal,
      onStdout: (text) => {
        if (text) {
          broadcastTerminalStreamEvent({ v: 1, executionId, seq: bump(), type: "stdout", text });
        }
      },
      onStderr: (text) => {
        if (text) {
          broadcastTerminalStreamEvent({ v: 1, executionId, seq: bump(), type: "stderr", text });
        }
      }
    });

    await runtime.stateRepository.upsertTask({
      ...task,
      status: commandResult.success ? "completed" : "failed",
      startedAt: task.startedAt ?? Date.now(),
      updatedAt: Date.now(),
      completedAt: commandResult.completedAt,
      resultJson: commandResult.success ? commandResult.summary : undefined,
      errorJson: commandResult.success ? undefined : commandResult.summary
    });
    await runtime.stateRepository.appendAuditRecord({
      entityType: "task",
      entityId: task.id,
      action: commandResult.success ? "task.completed" : "task.failed",
      detail: commandResult.summary,
      createdAt: Date.now()
    });
    await runtime.workspaceService.updateSessionSummary(
      task.workspaceId,
      {
        lastTaskId: task.id
      },
      task.id
    );

    broadcastTerminalStreamEvent({
      v: 1,
      executionId,
      seq: bump(),
      type: "done",
      exitCode: commandResult.exitCode,
      success: commandResult.success,
      summary: commandResult.summary,
      signal: commandResult.signal
    });
  } catch (error) {
    const failure = toUserMessage(error);
    broadcastTerminalStreamEvent({
      v: 1,
      executionId,
      seq: bump(),
      type: "error",
      message: failure.message
    });
    broadcastTerminalStreamEvent({
      v: 1,
      executionId,
      seq: bump(),
      type: "done",
      exitCode: null,
      success: false,
      summary: failure.message
    });
    await runtime.stateRepository.upsertTask({
      ...task,
      status: "failed",
      updatedAt: Date.now(),
      errorJson: failure.message
    });
  } finally {
    terminalStreamAbortControllers.delete(executionId);
  }
}

async function executeGovernedCommandStream(input: {
  command: string;
  args: string[];
  shell?: boolean;
}): Promise<CommandRunStreamStart> {
  const prepared = await prepareGovernedCommand(input);
  if (prepared.kind === "approval") {
    const r = prepared.runResult;
    return {
      mode: "waiting-approval",
      taskId: r.taskId,
      request: r.request,
      approvalRequest: r.approvalRequest!
    };
  }

  const executionId = createId("termexec");
  const controller = new AbortController();
  terminalStreamAbortControllers.set(executionId, controller);
  void runCommandTaskStream(prepared.task, prepared.request, executionId, controller.signal);
  return {
    mode: "started",
    executionId,
    taskId: prepared.task.id,
    request: prepared.request
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

    if (input.decision === "approved" && relatedTask.type === "command.run") {
      const restoredRequest = restoreCommandRequestFromTask({
        ...relatedTask,
        checkpointId
      });
      await runCommandTask(
        {
          ...relatedTask,
          checkpointId
        },
        restoredRequest
      );
    }
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
  ipcMain.handle("window:minimize", () => {
    mainWindow?.minimize();
  });

  ipcMain.handle("window:maximize", () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.handle("window:close", () => {
    mainWindow?.close();
  });

  ipcMain.handle("window:isMaximized", (): boolean => {
    return mainWindow?.isMaximized() ?? false;
  });

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

  ipcMain.handle("app:getModelHealth", async (): Promise<IpcResult<ModelGatewayHealthSnapshot>> => {
    try {
      if (!runtime) {
        return err(ERROR_CODES.internal, "Runtime not initialized.");
      }
      return ok(await refreshModelHealthSnapshot(runtime));
    } catch (error) {
      if (runtime) {
        void recordRuntimeError(runtime.errorReporter, runtime.diagnostics, runtime.logger, error, {
          surface: "app:getModelHealth"
        });
      }
      const failure = toUserMessage(error);
      return err(failure.code, failure.message);
    }
  });

  ipcMain.handle("app:updatePreferences", async (_event, patch: AppPreferencePatch): Promise<IpcResult<AppInfo>> => {
    try {
      if (!runtime) {
        return err(ERROR_CODES.internal, "Runtime not initialized.");
      }

      runtime.config = applyConfigPatch(runtime.config, patch, nativeTheme.shouldUseDarkColors);
      await saveConfig(runtime.configDir, runtime.config);
      if (patch.modelPreferences) {
        runtime.modelGateway = createModelGateway(runtime.config);
        runtime.agentRuntime = createAgentRuntime(runtime.stateRepository, runtime.modelGateway);
        await refreshModelHealthSnapshot(runtime);
      }
      runtime.logger.info(
        `Preferences updated: language=${runtime.config.language}, themeMode=${runtime.config.themeMode}`,
        {
          language: runtime.config.language,
          themeMode: runtime.config.themeMode,
          modelPreferences: patch.modelPreferences
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
      await startWorkspaceWatcher(runtime, workspace.rootPath);
      await recoverWorkspaceExecutionState(runtime, workspace.id);
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

  ipcMain.handle("workspace:pin", async (_event, workspaceId: string): Promise<IpcResult<RecentWorkspaceEntry[]>> => {
    try {
      return ok(await requireRuntime().workspaceService.pinWorkspace(workspaceId));
    } catch (error) {
      const failure = toUserMessage(error);
      return err(failure.code, failure.message);
    }
  });

  ipcMain.handle("workspace:unpin", async (_event, workspaceId: string): Promise<IpcResult<RecentWorkspaceEntry[]>> => {
    try {
      return ok(await requireRuntime().workspaceService.unpinWorkspace(workspaceId));
    } catch (error) {
      const failure = toUserMessage(error);
      return err(failure.code, failure.message);
    }
  });

  ipcMain.handle("workspace:reorder", async (_event, input: ReorderWorkspacesInput): Promise<IpcResult<RecentWorkspaceEntry[]>> => {
    try {
      return ok(await requireRuntime().workspaceService.reorderWorkspaces(input));
    } catch (error) {
      const failure = toUserMessage(error);
      return err(failure.code, failure.message);
    }
  });

  ipcMain.handle("workspace:removeFromSidebar", async (_event, workspaceId: string): Promise<IpcResult<RecentWorkspaceEntry[]>> => {
    try {
      return ok(await requireRuntime().workspaceService.removeWorkspaceFromSidebar(workspaceId));
    } catch (error) {
      const failure = toUserMessage(error);
      return err(failure.code, failure.message);
    }
  });

  ipcMain.handle("workspace:restoreToSidebar", async (_event, workspaceId: string): Promise<IpcResult<RecentWorkspaceEntry[]>> => {
    try {
      return ok(await requireRuntime().workspaceService.restoreWorkspaceToSidebar(workspaceId));
    } catch (error) {
      const failure = toUserMessage(error);
      return err(failure.code, failure.message);
    }
  });

  ipcMain.handle("workspace:revealInFileManager", async (_event, workspacePath: string): Promise<IpcResult<boolean>> => {
    try {
      shell.showItemInFolder(workspacePath);
      return ok(true);
    } catch (error) {
      const failure = toUserMessage(error);
      return err(failure.code, failure.message);
    }
  });

  ipcMain.handle("workspace:readFile", async (_event, relativePath: string): Promise<IpcResult<WorkspaceFileDocument>> => {
    try {
      const runtimeState = requireRuntime();
      const { workspaceRoot } = requireCurrentWorkspaceState();
      const document = await runtimeState.fsOps.readDocument(workspaceRoot, relativePath);
      return ok({
        path: relativePath,
        content: document.content,
        lastModifiedAt: document.lastModifiedAt
      });
    } catch (error) {
      const failure = toUserMessage(error);
      return err(failure.code, failure.message);
    }
  });

  ipcMain.handle("workspace:listTree", async (): Promise<IpcResult<WorkspaceTreeNode[]>> => {
    try {
      const runtimeState = requireRuntime();
      const { workspaceRoot } = requireCurrentWorkspaceState();
      return ok(await runtimeState.fsOps.listTree(workspaceRoot));
    } catch (error) {
      const failure = toUserMessage(error);
      return err(failure.code, failure.message);
    }
  });

  ipcMain.handle("workspace:search", async (_event, query: string): Promise<IpcResult<WorkspaceSearchHit[]>> => {
    try {
      const runtimeState = requireRuntime();
      const { workspaceRoot } = requireCurrentWorkspaceState();
      return ok(await runtimeState.fsOps.search(workspaceRoot, query));
    } catch (error) {
      const failure = toUserMessage(error);
      return err(failure.code, failure.message);
    }
  });

  ipcMain.handle("workspace:outline", async (_event, relativePath: string): Promise<IpcResult<FileOutlineItem[]>> => {
    try {
      const runtimeState = requireRuntime();
      const { workspaceRoot } = requireCurrentWorkspaceState();
      return ok(await runtimeState.fsOps.outline(workspaceRoot, relativePath));
    } catch (error) {
      const failure = toUserMessage(error);
      return err(failure.code, failure.message);
    }
  });

  ipcMain.handle("workspace:setEditorDirtyPaths", async (_event, relativePaths: string[]): Promise<IpcResult<boolean>> => {
    try {
      const runtimeState = requireRuntime();
      runtimeState.dirtyEditorPaths.clear();
      for (const entry of relativePaths ?? []) {
        const normalized = entry.replace(/\\/g, "/").trim();
        if (normalized) {
          runtimeState.dirtyEditorPaths.add(normalized);
        }
      }
      return ok(true);
    } catch (error) {
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

  ipcMain.handle("conversation:createSession", async (_event, title?: string): Promise<IpcResult<ConversationSessionRecord>> => {
    try {
      const { workspaceId } = requireCurrentWorkspaceState();
      return ok(await requireRuntime().conversationService.createSession(workspaceId, title?.trim() || "Single Agent Session"));
    } catch (error) {
      const failure = toUserMessage(error);
      return err(failure.code, failure.message);
    }
  });

  ipcMain.handle("conversation:listSessions", async (): Promise<IpcResult<ConversationSessionRecord[]>> => {
    try {
      const { workspaceId } = requireCurrentWorkspaceState();
      return ok(await requireRuntime().conversationService.listSessions(workspaceId));
    } catch (error) {
      const failure = toUserMessage(error);
      return err(failure.code, failure.message);
    }
  });

  ipcMain.handle("conversation:getSession", async (_event, sessionId: string) => {
    try {
      return ok(await requireRuntime().conversationService.getSession(sessionId));
    } catch (error) {
      const failure = toUserMessage(error);
      return err(failure.code, failure.message);
    }
  });

  ipcMain.handle(
    "conversation:renameSession",
    async (_event, input: { sessionId: string; title: string }): Promise<IpcResult<ConversationSessionRecord>> => {
      try {
        return ok(await requireRuntime().conversationService.renameSession(input.sessionId, input.title));
      } catch (error) {
        const failure = toUserMessage(error);
        return err(failure.code, failure.message);
      }
    }
  );

  ipcMain.handle("conversation:pinSession", async (_event, sessionId: string): Promise<IpcResult<ConversationSessionRecord>> => {
    try {
      return ok(await requireRuntime().conversationService.pinSession(sessionId));
    } catch (error) {
      const failure = toUserMessage(error);
      return err(failure.code, failure.message);
    }
  });

  ipcMain.handle("conversation:unpinSession", async (_event, sessionId: string): Promise<IpcResult<ConversationSessionRecord>> => {
    try {
      return ok(await requireRuntime().conversationService.unpinSession(sessionId));
    } catch (error) {
      const failure = toUserMessage(error);
      return err(failure.code, failure.message);
    }
  });

  ipcMain.handle(
    "conversation:reorderSessions",
    async (_event, input: ReorderSessionsInput): Promise<IpcResult<ConversationSessionRecord[]>> => {
      try {
        return ok(await requireRuntime().conversationService.reorderSessions(input));
      } catch (error) {
        const failure = toUserMessage(error);
        return err(failure.code, failure.message);
      }
    }
  );

  ipcMain.handle(
    "conversation:markSessionRead",
    async (_event, input: { sessionId: string; readAt?: number }): Promise<IpcResult<ConversationSessionRecord>> => {
      try {
        return ok(await requireRuntime().conversationService.markSessionRead(input.sessionId, input.readAt));
      } catch (error) {
        const failure = toUserMessage(error);
        return err(failure.code, failure.message);
      }
    }
  );

  ipcMain.handle("conversation:markSessionUnread", async (_event, sessionId: string): Promise<IpcResult<ConversationSessionRecord>> => {
    try {
      return ok(await requireRuntime().conversationService.markSessionUnread(sessionId));
    } catch (error) {
      const failure = toUserMessage(error);
      return err(failure.code, failure.message);
    }
  });

  ipcMain.handle("conversation:archiveSession", async (_event, sessionId: string): Promise<IpcResult<ConversationSessionRecord>> => {
    try {
      return ok(await requireRuntime().conversationService.archiveSession(sessionId));
    } catch (error) {
      const failure = toUserMessage(error);
      return err(failure.code, failure.message);
    }
  });

  ipcMain.handle("conversation:archiveAllInWorkspace", async (): Promise<IpcResult<ConversationSessionRecord[]>> => {
    try {
      const { workspaceId } = requireCurrentWorkspaceState();
      return ok(await requireRuntime().conversationService.archiveAllSessionsInWorkspace(workspaceId));
    } catch (error) {
      const failure = toUserMessage(error);
      return err(failure.code, failure.message);
    }
  });

  ipcMain.handle("conversation:deleteSession", async (_event, sessionId: string): Promise<IpcResult<boolean>> => {
    try {
      await requireRuntime().conversationService.deleteSession(sessionId);
      return ok(true);
    } catch (error) {
      const failure = toUserMessage(error);
      return err(failure.code, failure.message);
    }
  });

  ipcMain.handle(
    "conversation:sendMessage",
    async (
      _event,
      input: { sessionId: string; content: string; scenario?: "chat" | "plan" | "code-edit" }
    ): Promise<IpcResult<ConversationSendResult>> => {
      try {
        return ok(await executeConversationRun(input));
      } catch (error) {
        const failure = toUserMessage(error);
        return err(failure.code, failure.message);
      }
    }
  );

  ipcMain.handle("conversation:cancelMessage", async (_event, runId: string): Promise<IpcResult<AgentRunDetail | undefined>> => {
    try {
      const runtimeState = requireRuntime();
      const controller = runStreamAbortControllers.get(runId);
      controller?.abort();
      const detail = await runtimeState.stateRepository.getAgentRunDetail(runId);
      if (!detail) {
        return ok(undefined);
      }
      await runtimeState.stateRepository.upsertAgentRun({
        ...detail.run,
        status: "aborted",
        updatedAt: Date.now(),
        completedAt: Date.now()
      });
      return ok(await runtimeState.stateRepository.getAgentRunDetail(runId));
    } catch (error) {
      const failure = toUserMessage(error);
      return err(failure.code, failure.message);
    }
  });

  ipcMain.handle(
    "agent:startRun",
    async (
      _event,
      input: { sessionId: string; prompt: string; scenario?: "chat" | "plan" | "code-edit" }
    ): Promise<IpcResult<ConversationSendResult>> => {
      try {
        return ok(
          await executeConversationRun({
            sessionId: input.sessionId,
            content: input.prompt,
            scenario: input.scenario
          })
        );
      } catch (error) {
        const failure = toUserMessage(error);
        return err(failure.code, failure.message);
      }
    }
  );

  ipcMain.handle("agent:getRun", async (_event, runId: string): Promise<IpcResult<AgentRunDetail | undefined>> => {
    try {
      return ok(await requireRuntime().agentRuntime.getRun(runId));
    } catch (error) {
      const failure = toUserMessage(error);
      return err(failure.code, failure.message);
    }
  });

  ipcMain.handle("agent:retryRun", async (_event, runId: string): Promise<IpcResult<AgentRunDetail | undefined>> => {
    try {
      const runtimeState = requireRuntime();
      const detail = await runtimeState.agentRuntime.getRun(runId);
      if (!detail) {
        return ok(undefined);
      }
      const rerun = await executeConversationRun({
        sessionId: detail.run.sessionId,
        content: detail.run.prompt,
        scenario: detail.run.scenario
      });
      return ok(rerun.runDetail);
    } catch (error) {
      const failure = toUserMessage(error);
      return err(failure.code, failure.message);
    }
  });

  ipcMain.handle("agent:abortRun", async (_event, runId: string): Promise<IpcResult<AgentRunDetail | undefined>> => {
    try {
      const runtimeState = requireRuntime();
      const controller = runStreamAbortControllers.get(runId);
      controller?.abort();
      const detail = await runtimeState.stateRepository.getAgentRunDetail(runId);
      if (!detail) {
        return ok(undefined);
      }
      await runtimeState.stateRepository.upsertAgentRun({
        ...detail.run,
        status: "aborted",
        updatedAt: Date.now(),
        completedAt: Date.now()
      });
      return ok(await runtimeState.stateRepository.getAgentRunDetail(runId));
    } catch (error) {
      const failure = toUserMessage(error);
      return err(failure.code, failure.message);
    }
  });

  ipcMain.handle("patch:getPatchSet", async (_event, patchSetId: string): Promise<IpcResult<PatchSet | undefined>> => {
    try {
      return ok(await requireRuntime().stateRepository.getPatchSet(patchSetId));
    } catch (error) {
      const failure = toUserMessage(error);
      return err(failure.code, failure.message);
    }
  });

  ipcMain.handle(
    "patch:setHunkDecision",
    async (
      _event,
      input: { patchSetId: string; hunkId: string; decision: "pending" | "accepted" | "rejected" }
    ): Promise<IpcResult<PatchSet>> => {
      try {
        return ok(await requireRuntime().stateRepository.setPatchHunkDecision(input));
      } catch (error) {
        const failure = toUserMessage(error);
        return err(failure.code, failure.message);
      }
    }
  );

  ipcMain.handle("patch:applyPatchSet", async (_event, patchSetId: string): Promise<IpcResult<PatchApplicationResult>> => {
    try {
      return ok(await applyPatchAndValidate(patchSetId));
    } catch (error) {
      const failure = toUserMessage(error);
      return err(failure.code, failure.message);
    }
  });

  ipcMain.handle("patch:rollbackPatchSet", async (_event, patchSetId: string): Promise<IpcResult<PatchSet>> => {
    try {
      const runtimeState = requireRuntime();
      const { workspaceRoot } = requireCurrentWorkspaceState();
      const patchSet = await runtimeState.stateRepository.getPatchSet(patchSetId);
      if (!patchSet) {
        return err(ERROR_CODES.notFound, "Patch set not found.");
      }
      const rolledBack = await runtimeState.changeEngine.rollbackPatchSet(workspaceRoot, patchSet);
      await runtimeState.stateRepository.upsertPatchSet(rolledBack);
      return ok(rolledBack);
    } catch (error) {
      const failure = toUserMessage(error);
      return err(failure.code, failure.message);
    }
  });

  ipcMain.handle("command:getProfiles", async () =>
    ok([
      { id: "build", label: "Build" },
      { id: "test", label: "Test" },
      { id: "lint", label: "Lint" },
      { id: "install", label: "Install" },
      { id: "custom", label: "Custom" }
    ])
  );

  ipcMain.handle(
    "command:run",
    async (
      _event,
      input: { command: string; args: string[]; shell?: boolean }
    ): Promise<IpcResult<CommandRunResult>> => {
      try {
        return ok(await executeGovernedCommand(input));
      } catch (error) {
        if (runtime) {
          void recordRuntimeError(runtime.errorReporter, runtime.diagnostics, runtime.logger, error, {
            surface: "command:run",
            command: input.command
          });
        }
        const failure = toUserMessage(error);
        return err(failure.code, failure.message);
      }
    }
  );

  ipcMain.handle(
    "command:runStream",
    async (
      _event,
      input: { command: string; args: string[]; shell?: boolean }
    ): Promise<IpcResult<CommandRunStreamStart>> => {
      try {
        return ok(await executeGovernedCommandStream(input));
      } catch (error) {
        if (runtime) {
          void recordRuntimeError(runtime.errorReporter, runtime.diagnostics, runtime.logger, error, {
            surface: "command:runStream",
            command: input.command
          });
        }
        const failure = toUserMessage(error);
        return err(failure.code, failure.message);
      }
    }
  );

  ipcMain.handle("command:stopStream", async (_event, executionId: string): Promise<IpcResult<boolean>> => {
    try {
      const controller = terminalStreamAbortControllers.get(executionId);
      if (!controller) {
        return ok(false);
      }
      controller.abort();
      return ok(true);
    } catch (error) {
      const failure = toUserMessage(error);
      return err(failure.code, failure.message);
    }
  });

  ipcMain.handle("command:listRecent", async (_event, limit?: number): Promise<IpcResult<CommandRequest[]>> => {
    try {
      const runtimeState = requireRuntime();
      const workspace = runtimeState.workspaceService.getCurrentWorkspace();
      if (!workspace) {
        return ok([]);
      }
      const rows = await runtimeState.stateRepository.listRecentCommandRequests(workspace.id, limit ?? 30);
      return ok(rows);
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

const isDev = !app.isPackaged && process.env.ELECTRON_DEV !== "false";

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
    frame: false,
    titleBarStyle: "hidden",
    titleBarOverlay: false,
    backgroundColor: "#0e1217",
    trafficLightPosition: { x: 8, y: 8 },
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

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

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

  if (isDev) {
    const rendererDevUrl = (process.env.ADL_RENDERER_DEV_URL ?? "http://localhost:5173").trim() || "http://localhost:5173";
    await mainWindow.loadURL(rendererDevUrl);
  } else {
    await mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
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
    void runtime.workspaceWatcher.close();
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
