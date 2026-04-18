import type {
  AppInfo,
  AppPreferencePatch,
  CheckpointPayloadPreview,
  HealthSnapshot,
  IpcResult,
  RecentWorkspaceEntry,
  RetrievalSnapshot,
  RuntimeDiagnosticsSnapshot,
  TaskCenterSnapshot,
  WorkspaceMeta
} from "@ai-digital-life/kernel";

export interface DigitalLifeBridge {
  app: {
    getInfo: () => Promise<IpcResult<AppInfo>>;
    getHealth: () => Promise<IpcResult<HealthSnapshot>>;
    getDiagnostics: () => Promise<IpcResult<RuntimeDiagnosticsSnapshot>>;
    updatePreferences: (patch: AppPreferencePatch) => Promise<IpcResult<AppInfo>>;
  };
  workspace: {
    listRecent: () => Promise<IpcResult<RecentWorkspaceEntry[]>>;
    open: (workspacePath: string) => Promise<IpcResult<WorkspaceMeta>>;
  };
  retrieval: {
    getStatus: () => Promise<IpcResult<RetrievalSnapshot | undefined>>;
  };
  task: {
    getSnapshot: () => Promise<IpcResult<TaskCenterSnapshot>>;
    getCheckpointPreview: (checkpointId: string) => Promise<IpcResult<CheckpointPayloadPreview | undefined>>;
    restoreCheckpoint: (checkpointId: string) => Promise<IpcResult<TaskCenterSnapshot>>;
    decideApproval: (input: { approvalId: string; decision: "approved" | "rejected"; reason?: string }) => Promise<IpcResult<TaskCenterSnapshot>>;
  };
}
