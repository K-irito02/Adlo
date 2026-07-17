import { BrowserToolbar } from './BrowserToolbar';
import { BrowserPanelStateCtx } from './BrowserPanelStateContext';
import { BrowserPanelActionsCtx } from './BrowserPanelActionsContext';
import type { BrowserPanelState } from './BrowserPanelStateContext';
import type { BrowserPanelActions } from './BrowserPanelActionsContext';

interface BrowserToolbarAreaProps {
  stateValue: BrowserPanelState;
  actionsValue: BrowserPanelActions;
}

export function BrowserToolbarArea({ stateValue, actionsValue }: BrowserToolbarAreaProps) {
  return (
    <BrowserPanelStateCtx.Provider value={stateValue}>
      <BrowserPanelActionsCtx.Provider value={actionsValue}>
        <BrowserToolbar />
      </BrowserPanelActionsCtx.Provider>
    </BrowserPanelStateCtx.Provider>
  );
}
