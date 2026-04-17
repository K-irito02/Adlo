import type { AppInfo, HealthSnapshot, IpcResult, RecentWorkspaceEntry, RetrievalSnapshot, WorkspaceMeta } from "@ai-digital-life/kernel";

export interface DigitalLifeBridge {
  app: {
    getInfo: () => Promise<IpcResult<AppInfo>>;
    getHealth: () => Promise<IpcResult<HealthSnapshot>>;
  };
  workspace: {
    listRecent: () => Promise<IpcResult<RecentWorkspaceEntry[]>>;
    open: (workspacePath: string) => Promise<IpcResult<WorkspaceMeta>>;
  };
  retrieval: {
    getStatus: () => Promise<IpcResult<RetrievalSnapshot | undefined>>;
  };
}
