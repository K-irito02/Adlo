import { useCallback, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { DIFF_LAYOUT_STORAGE_KEY } from '@utils/constants';

import { countGitChanges } from '../types';
import { useAppStore } from '@stores/slicedStore';

function readDiffSideBySidePreference(): boolean {
  try {
    return window.localStorage.getItem(DIFF_LAYOUT_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function useRightPanelViewProps() {
  const { activeRightTool, setActiveRightTool, ciSnapshot } = useAppStore(
    useShallow((state) => ({
      activeRightTool: state.activeRightTool,
      setActiveRightTool: state.setActiveRightTool,
      ciSnapshot: state.ciSnapshot,
    })),
  );
  const browserTabs = useAppStore(useShallow((state) => state.browserTabs));
  const terminalTabs = useAppStore(useShallow((state) => state.terminalTabs));
  const dirtyEditorPaths = useAppStore(useShallow((s) => s.dirtyEditorPaths));
  const auditEntries = useAppStore(useShallow((s) => s.auditEntries));
  const gitSnapshot = useAppStore(useShallow((s) => s.gitSnapshot));
  const appInfoForBadges = useAppStore(useShallow((s) => s.appInfo));

  const [diffSideBySide, setDiffSideBySide] = useState(readDiffSideBySidePreference);

  const persistDiffLayout = useCallback((sideBySide: boolean) => {
    setDiffSideBySide(sideBySide);
    try {
      window.localStorage.setItem(DIFF_LAYOUT_STORAGE_KEY, sideBySide ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, []);

  const communicateBadge = useMemo(() => {
    if (!ciSnapshot?.latestRun) {
      return 0;
    }
    const c = ciSnapshot.latestRun.conclusion;
    return c === 'failure' || c === 'cancelled' ? 1 : 0;
  }, [ciSnapshot]);

  const badges = useMemo(
    () => ({
      files: dirtyEditorPaths.length,
      changes: countGitChanges(gitSnapshot ?? appInfoForBadges?.currentWorkspace?.gitSnapshot),
      browser: browserTabs.length,
      terminal: terminalTabs.length,
      audit: auditEntries.length,
      settings: 0,
      ci: 0,
      communicate: communicateBadge,
    }),
    [
      dirtyEditorPaths.length,
      gitSnapshot,
      appInfoForBadges?.currentWorkspace?.gitSnapshot,
      browserTabs.length,
      terminalTabs.length,
      auditEntries.length,
      communicateBadge,
    ],
  );

  return {
    activeRightTool,
    setActiveRightTool,
    badges,
    diffSideBySide,
    onSetDiffLayout: persistDiffLayout,
  };
}
