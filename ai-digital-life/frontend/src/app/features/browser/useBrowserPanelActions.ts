import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@stores/slicedStore';
import type { BrowserPanelActions } from './BrowserPanelActionsContext';

type BrowserPanelActionsInput = Omit<BrowserPanelActions, 'browserOpenTab' | 'toggleNavigator'>;

export function useBrowserPanelActions(
  handlers: BrowserPanelActionsInput,
  deps: React.DependencyList
): BrowserPanelActions {
  const storeActions = useAppStore(
    useShallow((s) => ({
      browserOpenTab: s.browserOpenTab,
      toggleNavigator: s.toggleNavigator as (tool: string) => void,
    }))
  );

  return useMemo(
    () => ({ ...handlers, ...storeActions }),
    [...deps, storeActions.browserOpenTab, storeActions.toggleNavigator]
  );
}
