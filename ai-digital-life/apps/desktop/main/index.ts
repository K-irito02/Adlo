import path from "node:path";
import { Worker } from "node:worker_threads";
import { app, BrowserWindow, ipcMain, nativeTheme } from "electron";
import { applyConfigPatch, loadConfig, saveConfig } from "@ai-digital-life/config";
import {
  APP_NAME,
  APP_VERSION,
  ERROR_CODES,
  type AppInfo,
  type AppPreferencePatch,
  type ConfigSnapshot,
  type HealthSnapshot,
  type IpcResult,
  type LogEntrySummary,
  type RetrievalSnapshot,
  type RiskLevel,
  type TaskCenterSnapshot,
  type TaskStatus,
  ok,
  err,
  toUserMessage
} from "@ai-digital-life/kernel";
import { createLoggerFactory, type Logger } from "@ai-digital-life/logger";
import { StateRepository } from "@ai-digital-life/storage";
import { WorkspaceService } from "@ai-digital-life/workspace";

type Runtime = {
  configDir: string;
  config: ConfigSnapshot;
  logger: Logger;
  stateRepository: StateRepository;
  workspaceService: WorkspaceService;
  getRecentLogs: (limit?: number) => LogEntrySummary[];
  retrieval: RetrievalController;
};

class RetrievalController {
  private readonly logger: Logger;
  private readonly workerPath: string;
  private worker?: Worker;
  private lastHeartbeatAt = 0;
  private storageHealthy = false;
  private currentSnapshot?: RetrievalSnapshot;

  constructor(workerPath: string, logger: Logger) {
    this.workerPath = workerPath;
    this.logger = logger;
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

async function createRuntime(): Promise<Runtime> {
  const userDataPath = app.getPath("userData");
  const configDir = path.join(userDataPath, "config");
  const stateDir = path.join(userDataPath, "state");
  const logDir = path.join(userDataPath, "logs");
  const config = await loadConfig(configDir, nativeTheme.shouldUseDarkColors);
  const loggerFactory = await createLoggerFactory(logDir, config.logLevel);
  const logger = loggerFactory.createLogger("main");
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
    loggerFactory.createLogger("retrieval")
  );
  await retrieval.start(stateRepository);
  retrieval.markStorageHealthy();
  const currentWorkspace = workspaceService.getCurrentWorkspace();
  if (currentWorkspace) {
    await retrieval.startIndexing(currentWorkspace.id, currentWorkspace.rootPath);
  }
  logger.info("Runtime initialized.");

  return {
    configDir,
    config,
    logger,
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

async function createTaskCenterSnapshot(): Promise<TaskCenterSnapshot> {
  if (!runtime) {
    throw new Error("Runtime not initialized.");
  }

  const currentWorkspace = runtime.workspaceService.getCurrentWorkspace();
  const retrieval = currentWorkspace
    ? await runtime.retrieval.getSnapshot(runtime.stateRepository, currentWorkspace.id)
    : undefined;
  const now = Date.now();
  const tasks = currentWorkspace
    ? [
        {
          id: `workspace-${currentWorkspace.id}`,
          title: "workspace.restore",
          description: "Restore the last workspace session into the desktop shell.",
          status: "completed" as const,
          riskLevel: "low" as const,
          updatedAt: currentWorkspace.lastOpenedAt,
          detail: `Workspace ${currentWorkspace.name} is attached and ready.`
        },
        {
          id: `retrieval-${currentWorkspace.id}`,
          title: "retrieval.index",
          description: "Maintain the local repository map and retrieval snapshot.",
          status: retrieval ? mapRetrievalStatusToTaskStatus(retrieval.status) : "pending",
          riskLevel: retrieval ? mapRetrievalStatusToRiskLevel(retrieval.status) : "low",
          updatedAt: retrieval?.updatedAt ?? now,
          detail: retrieval
            ? retrieval.status === "failed"
              ? retrieval.lastError ?? "Retrieval worker reported a failure."
              : `Scanned ${retrieval.scannedFiles} files and indexed ${retrieval.indexedTextFiles} text files.`
            : "Waiting for the first indexing run after workspace selection."
        }
      ]
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
    pendingApprovals: [],
    policy: {
      mode: "manual",
      summary: "High-risk actions stay approval-bound in Phase 0 and are not exposed directly in the renderer.",
      highRiskRules: [
        "Destructive file changes require explicit approval.",
        "Force Git actions and command execution stay blocked behind future governance flows.",
        "Renderer only shows approval state and never receives raw system privileges."
      ]
    }
  };
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
    return ok(runtime.retrieval.snapshot());
  });

  ipcMain.handle("app:updatePreferences", async (_event, patch: AppPreferencePatch): Promise<IpcResult<AppInfo>> => {
    try {
      if (!runtime) {
        return err(ERROR_CODES.internal, "Runtime not initialized.");
      }

      runtime.config = applyConfigPatch(runtime.config, patch, nativeTheme.shouldUseDarkColors);
      await saveConfig(runtime.configDir, runtime.config);
      runtime.logger.info(
        `Preferences updated: language=${runtime.config.language}, themeMode=${runtime.config.themeMode}`
      );
      return ok(createAppInfo());
    } catch (error) {
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
      return ok(workspace);
    } catch (error) {
      runtime?.logger.error(`Workspace open request failed: ${String(error)}`);
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
    try {
      return ok(await createTaskCenterSnapshot());
    } catch (error) {
      const failure = toUserMessage(error);
      return err(failure.code, failure.message);
    }
  });
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
  void runtime?.retrieval.shutdown();
  runtime?.stateRepository.close();
});
