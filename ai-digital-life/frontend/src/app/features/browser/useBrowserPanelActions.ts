import { useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@stores/slicedStore';
import type { BrowserPanelActions } from './BrowserPanelActionsContext';

type BrowserPanelActionsInput = Omit<BrowserPanelActions, 'browserOpenTab' | 'toggleNavigator'>;

export function useBrowserPanelActions(
  handlers: BrowserPanelActionsInput,
  _deps: React.DependencyList
): BrowserPanelActions {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const browserOpenTab = useAppStore(useShallow((s) => s.browserOpenTab));
  const toggleNavigator = useAppStore(
    useShallow((s) => s.toggleNavigator as (tool: string) => void)
  );

  return useMemo(
    () => ({ ...handlersRef.current, browserOpenTab, toggleNavigator }),
    [browserOpenTab, toggleNavigator]
  );
}
