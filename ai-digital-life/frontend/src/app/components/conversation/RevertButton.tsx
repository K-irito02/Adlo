import { useState } from 'react';
import { useTCopy } from '../../i18n/useTCopy';

export function RevertButton({
  snapshotId,
  workspaceId,
  workspaceRoot,
  onReverted,
}: {
  snapshotId: string;
  workspaceId?: string;
  workspaceRoot?: string;
  onReverted?: () => void;
}) {
  const { t } = useTCopy();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    if (!workspaceId || !workspaceRoot) {
      return;
    }
    setLoading(true);
    const result = await window.digitalLife.snapshot.revertToSnapshot(
      workspaceId,
      workspaceRoot,
      snapshotId
    );
    setLoading(false);
    setConfirming(false);
    if (result.ok) {
      onReverted?.();
    }
  };

  return (
    <button
      type="button"
      className={`adl-revert-button ${confirming ? 'adl-revert-confirming' : ''}`}
      onClick={handleClick}
      disabled={loading}
      aria-label={t.snapshotRevert}
    >
      {confirming ? t.snapshotRevertConfirm : t.snapshotRevert}
    </button>
  );
}
