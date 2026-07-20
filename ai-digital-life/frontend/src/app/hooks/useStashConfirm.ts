import { useState, useCallback } from 'react';
import type {
  GitSnapshot,
  WorkspaceGitBranchSwitchInput,
  WorkspaceGitBranchCreateInput,
} from '@ai-digital-life/kernel';

type PendingBranchAction =
  | { kind: 'switch'; input: WorkspaceGitBranchSwitchInput }
  | { kind: 'create'; input: WorkspaceGitBranchCreateInput };

interface UseStashConfirmOptions {
  snapshot?: GitSnapshot;
  onConfirm: (action: PendingBranchAction) => Promise<void>;
}

function hasDirtyChanges(snapshot?: GitSnapshot): boolean {
  if (!snapshot) {
    return false;
  }
  return (
    snapshot.staged.length > 0 || snapshot.unstaged.length > 0 || snapshot.untracked.length > 0
  );
}

export function useStashConfirm({ snapshot, onConfirm }: UseStashConfirmOptions) {
  const [pendingAction, setPendingAction] = useState<PendingBranchAction | null>(null);

  const needsConfirm = pendingAction !== null;

  const confirm = useCallback(async () => {
    if (!pendingAction) {
      return;
    }
    await onConfirm(pendingAction);
    setPendingAction(null);
  }, [pendingAction, onConfirm]);

  const cancel = useCallback(() => {
    setPendingAction(null);
  }, []);

  const initiateSwitch = useCallback(
    (input: WorkspaceGitBranchSwitchInput) => {
      if (hasDirtyChanges(snapshot)) {
        setPendingAction({ kind: 'switch', input: { ...input, allowStash: true } });
      } else {
        void onConfirm({ kind: 'switch', input });
      }
    },
    [snapshot, onConfirm],
  );

  const initiateCreate = useCallback(
    (input: WorkspaceGitBranchCreateInput) => {
      if (hasDirtyChanges(snapshot)) {
        setPendingAction({ kind: 'create', input: { ...input, allowStash: true } });
      } else {
        void onConfirm({ kind: 'create', input });
      }
    },
    [snapshot, onConfirm],
  );

  return {
    pendingAction,
    needsConfirm,
    confirm,
    cancel,
    setPendingAction,
    initiateSwitch,
    initiateCreate,
  };
}

export type { PendingBranchAction, UseStashConfirmOptions };
