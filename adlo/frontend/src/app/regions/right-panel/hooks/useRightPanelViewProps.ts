import { useCallback, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { DIFF_LAYOUT_STORAGE_KEY } from '@utils/constants';

import { countGitChanges } from '../types';
import { useAppStore } from '@stores/slicedStore';
import { isPanelTab } from '@stores/slices/tabLocation';

function readDiffSideBySidePreference(): boolean {
  try {
    return window.localStorage.getItem(DIFF_LAYOUT_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function useRightPanelViewProps() {
  const { activeRightTool, setActiveRightTool } = useAppStore(
    useShallow((state) => ({
      activeRightTool: state.activeRightTool,
      setActiveRightTool: state.setActiveRightTool,
    })),
  );
  const browserTabs = useAppStore(useShallow((state) => state.browserTabs));
  const terminalTabs = useAppStore(useShallow((state) => state.terminalTabs));
  const dirtyEditorPaths = useAppStore(useShallow((s) => s.dirtyEditorPaths));
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

  // 徽章只统计右侧面板归属的标签：中心（location === 'center'）的标签由中心标签本体拥有，
  // 面板列表/树/计数均不重复计入（与 useBrowserTabs / useTerminalPanel 同一口径）。
  const panelBrowserTabCount = useMemo(() => browserTabs.filter(isPanelTab).length, [browserTabs]);
  const panelTerminalTabCount = useMemo(
    () => terminalTabs.filter(isPanelTab).length,
    [terminalTabs],
  );

  const badges = useMemo(
    () => ({
      files: dirtyEditorPaths.length,
      changes: countGitChanges(gitSnapshot ?? appInfoForBadges?.currentWorkspace?.gitSnapshot),
      browser: panelBrowserTabCount,
      terminal: panelTerminalTabCount,
      settings: 0,
    }),
    [
      dirtyEditorPaths.length,
      gitSnapshot,
      appInfoForBadges?.currentWorkspace?.gitSnapshot,
      panelBrowserTabCount,
      panelTerminalTabCount,
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
