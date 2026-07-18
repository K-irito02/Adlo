import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@stores/slicedStore';
import type { BrowserPanelState } from './BrowserPanelStateContext';

type BrowserPanelStateInput = Omit<
  BrowserPanelState,
  | 'browserNavigatorWidth'
  | 'navigatorCollapsed'
  | 'visibleWorkspaces'
  | 'isEmbedPending'
  | 'openTabCount'
  | 'navigatorTitle'
>;

export function useBrowserPanelState(
  value: BrowserPanelStateInput,
  deps: React.DependencyList
): BrowserPanelState {
  const storeValues = useAppStore(
    useShallow((s) => ({
      browserNavigatorWidth: s.browserNavigatorWidth,
      navigatorCollapsedByTool: s.navigatorCollapsedByTool,
      recentWorkspaces: s.recentWorkspaces,
      isTauri: s.isTauri,
    }))
  );

  return useMemo(() => {
    const navigatorCollapsed = storeValues.navigatorCollapsedByTool.browser ?? false;
    const visibleWorkspaces = storeValues.recentWorkspaces.filter(
      (w) => !w.removedFromSidebar && !w.hiddenFromRightPanels && w.available
    );
    const isEmbedPending =
      !storeValues.isTauri &&
      !!value.activeTab?.url &&
      value.activeTab?.url !== 'about:blank' &&
      !value.validatedUrlsRef.current.has(value.activeTab.url ?? '') &&
      !value.iframeBlockedDetected &&
      !value.iframeLoadError;
    const openTabCount = value.browserTabs.length;
    const navigatorTitle = value.t.toolBrowser;
    return {
      ...value,
      browserNavigatorWidth: storeValues.browserNavigatorWidth,
      navigatorCollapsed,
      visibleWorkspaces,
      isEmbedPending,
      openTabCount,
      navigatorTitle,
    };
  }, [
    // eslint-disable-next-line react-hooks/exhaustive-deps
    ...deps,
    storeValues.browserNavigatorWidth,
    storeValues.navigatorCollapsedByTool,
    storeValues.recentWorkspaces,
    storeValues.isTauri,
  ]);
}
