import type {
  AppInfo,
  AppPreferencePatch,
  HealthSnapshot,
  IpcResult,
  RecentWorkspaceEntry,
  RetrievalSnapshot,
  TaskCenterSnapshot,
  WorkspaceMeta
} from "@ai-digital-life/kernel";

export interface DigitalLifeBridge {
  app: {
    getInfo: () => Promise<IpcResult<AppInfo>>;
    getHealth: () => Promise<IpcResult<HealthSnapshot>>;
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
  };
}
