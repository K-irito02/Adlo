import type { SnapshotBridge, SnapshotRecord, RevertResult } from '../shared/ipc/snapshot';
import { invokeIpc } from './tauri-shared';

export function createTauriSnapshotBridge(): SnapshotBridge {
  return {
    createSnapshot: (params) => invokeIpc<SnapshotRecord>('create_snapshot', params),
    listSnapshots: (workspaceId, workspaceRoot) =>
      invokeIpc<SnapshotRecord[]>('list_snapshots', { workspaceId, workspaceRoot }),
    revertToSnapshot: (workspaceId, workspaceRoot, snapshotId) =>
      invokeIpc<RevertResult>('revert_to_snapshot_cmd', {
        workspaceId,
        workspaceRoot,
        snapshotId,
      }),
    pruneSnapshots: (workspaceId, workspaceRoot) =>
      invokeIpc<number>('prune_snapshots', { workspaceId, workspaceRoot }),
  };
}
