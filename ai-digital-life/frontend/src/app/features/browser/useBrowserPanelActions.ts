import { useMemo } from 'react';
import type { BrowserPanelActions } from './BrowserPanelActionsContext';

export function useBrowserPanelActions(
  value: BrowserPanelActions,
  deps: React.DependencyList
): BrowserPanelActions {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => value, deps);
}
