import { useEffect, useState } from 'react';
import { useAppStore } from '../../stores/slicedStore';
import type { SnapshotRecord } from '@shared/ipc/snapshot';

export function SnapshotList() {
  const listSnapshots = useAppStore((s) => s.listSnapshots);
  const appInfo = useAppStore((s) => s.appInfo);
  const workspaceId = appInfo?.currentWorkspace?.id;
  const workspaceRoot = appInfo?.currentWorkspace?.rootPath;
  const [snapshots, setSnapshots] = useState<SnapshotRecord[]>([]);

  useEffect(() => {
    if (!workspaceId || !workspaceRoot) {
      return;
    }
    listSnapshots(workspaceId, workspaceRoot)
      .then(setSnapshots)
      .catch(() => {});
  }, [workspaceId, workspaceRoot, listSnapshots]);

  return (
    <div className="adl-snapshot-list">
      <h3>Snapshots</h3>
      {snapshots.length === 0 && <p className="adl-empty-state">No snapshots yet</p>}
      {snapshots.map((snap) => (
        <div key={snap.id} className="adl-snapshot-item">
          <span>{new Date(snap.created_at).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}
