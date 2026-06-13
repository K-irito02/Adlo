import { useState, useMemo, useEffect, useCallback } from 'react';
import type { ChangesPanelProps } from '../../types';
import { readSelectedBranch, writeSelectedBranch } from '../../ChangesPanel/utils';

const FALLBACK_BRANCHES = ['main', 'develop', 'release/0.1.0', 'feature/right-panel'];

export function useBranchSelection(props: ChangesPanelProps) {
  const snapshot = props.gitSnapshot ?? props.appInfo?.currentWorkspace?.gitSnapshot;
  const fallbackBranch = snapshot?.branch ?? 'main';

  const [selectedBranch, setSelectedBranch] = useState(() => readSelectedBranch(fallbackBranch));

  const branchOptions = useMemo(() => {
    const options = new Set<string>([fallbackBranch, ...FALLBACK_BRANCHES]);
    return [...options];
  }, [fallbackBranch]);

  useEffect(() => {
    if (!branchOptions.includes(selectedBranch)) {
      setSelectedBranch(fallbackBranch);
      writeSelectedBranch(fallbackBranch);
    }
  }, [branchOptions, fallbackBranch, selectedBranch]);

  const handleSelectBranch = useCallback((branch: string) => {
    setSelectedBranch(branch);
    writeSelectedBranch(branch);
  }, []);

  return { selectedBranch, branchOptions, handleSelectBranch };
}
