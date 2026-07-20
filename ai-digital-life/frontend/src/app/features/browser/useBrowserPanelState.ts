import { useMemo, useRef } from 'react';
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
  _deps: React.DependencyList,
): BrowserPanelState {
  const valueRef = useRef(value);
  valueRef.current = value;

  const storeValues = useAppStore(
    useShallow((s) => ({
      browserNavigatorWidth: s.browserNavigatorWidth,
      navigatorCollapsedByTool: s.navigatorCollapsedByTool,
      recentWorkspaces: s.recentWorkspaces,
      isTauri: s.isTauri,
    })),
  );

  return useMemo(() => {
    const v = valueRef.current;
    const navigatorCollapsed = storeValues.navigatorCollapsedByTool.browser ?? false;
    const visibleWorkspaces = storeValues.recentWorkspaces.filter(
      (w) => !w.removedFromSidebar && !w.hiddenFromRightPanels && w.available,
    );
    const isEmbedPending =
      !storeValues.isTauri &&
      !!v.activeTab?.url &&
      v.activeTab?.url !== 'about:blank' &&
      !v.validatedUrlsRef.current.has(v.activeTab.url ?? '') &&
      !v.iframeBlockedDetected &&
      !v.iframeLoadError;
    const openTabCount = v.browserTabs.length;
    const navigatorTitle = v.t.toolBrowser;
    return {
      ...v,
      browserNavigatorWidth: storeValues.browserNavigatorWidth,
      navigatorCollapsed,
      visibleWorkspaces,
      isEmbedPending,
      openTabCount,
      navigatorTitle,
    };
  }, [
    storeValues.browserNavigatorWidth,
    storeValues.navigatorCollapsedByTool,
    storeValues.recentWorkspaces,
    storeValues.isTauri,
  ]);
}
