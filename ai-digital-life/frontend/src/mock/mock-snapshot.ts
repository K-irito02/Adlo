import type { SnapshotBridge } from "../shared/ipc/snapshot";

export const mockSnapshot: SnapshotBridge = {
  createSnapshot: async (_params) => ({
    ok: true,
    data: {
      id: `snap-${Date.now()}`,
      message_id: _params.messageId,
      session_id: _params.sessionId,
      workspace_id: _params.workspaceId,
      created_at: Date.now(),
      git_commit: 'mock-commit-hash',
      file_count: 3,
      total_bytes: 1024,
    },
  }),
  listSnapshots: async (_workspaceId, _workspaceRoot) => ({
    ok: true,
    data: [
      {
        id: 'snap-mock-1',
        message_id: 'msg-mock-1',
        session_id: 'session-mock-1',
        workspace_id: _workspaceId,
        created_at: Date.now() - 3600_000,
        git_commit: 'abc1234',
        file_count: 2,
        total_bytes: 512,
      },
    ],
  }),
  revertToSnapshot: async (_workspaceId, _workspaceRoot, snapshotId) => ({
    ok: true,
    data: {
      success: true,
      snapshot_id: snapshotId,
      message_id: 'msg-mock-1',
      files_restored: 2,
      error: null,
    },
  }),
  pruneSnapshots: async (_workspaceId, _workspaceRoot) => ({
    ok: true,
    data: 1,
  }),
};
