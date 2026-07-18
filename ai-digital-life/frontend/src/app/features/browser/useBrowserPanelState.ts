import { useMemo } from 'react';
import type { BrowserPanelState } from './BrowserPanelStateContext';

export function useBrowserPanelState(
  value: BrowserPanelState,
  deps: React.DependencyList
): BrowserPanelState {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => value, deps);
}
