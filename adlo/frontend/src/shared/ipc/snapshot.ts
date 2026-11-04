import type { IpcResult } from '@adlo/kernel';

export type { IpcResult };

export interface SnapshotRecord {
  id: string;
  message_id: string;
  session_id: string;
  workspace_id: string;
  created_at: number;
  git_commit: string | null;
  file_count: number;
  total_bytes: number;
}

export interface RevertResult {
  success: boolean;
  snapshot_id: string;
  message_id: string;
  files_restored: number;
  error: string | null;
}

export interface SnapshotBridge {
  createSnapshot(params: {
    workspaceId: string;
    workspaceRoot: string;
    messageId: string;
    sessionId: string;
  }): Promise<IpcResult<SnapshotRecord>>;
  listSnapshots(workspaceId: string, workspaceRoot: string): Promise<IpcResult<SnapshotRecord[]>>;
  revertToSnapshot(
    workspaceId: string,
    workspaceRoot: string,
    snapshotId: string,
  ): Promise<IpcResult<RevertResult>>;
  pruneSnapshots(workspaceId: string, workspaceRoot: string): Promise<IpcResult<number>>;
}
