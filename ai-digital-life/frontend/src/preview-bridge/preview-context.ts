import type {
  AppInfo,
  RecentWorkspaceEntry,
  WorkspaceMeta,
  RetrievalSnapshot,
} from '@ai-digital-life/kernel';

export interface PreviewContext {
  appInfo: AppInfo;
  recentWorkspaces: RecentWorkspaceEntry[];
  currentWorkspace: WorkspaceMeta | undefined;
  retrievalStatus: RetrievalSnapshot | undefined;
}

export interface PreviewWorkspaceOpenPayload {
  meta: WorkspaceMeta;
  recent: RecentWorkspaceEntry;
  retrieval: RetrievalSnapshot;
}
