import { BrowserToolbarArea } from './BrowserToolbarArea';
import { BrowserContentArea } from './BrowserContentArea';
import type { BrowserPanelState } from './BrowserPanelStateContext';
import type { BrowserPanelActions } from './BrowserPanelActionsContext';
import type { BrowserPanelDialogsProps } from './BrowserPanelDialogs';
import type { ContextMenuState } from './useBrowserMenus';

type DialogProps = Omit<BrowserPanelDialogsProps, 't'>;

interface BrowserShellProps extends DialogProps {
  stateValue: BrowserPanelState;
  actionsValue: BrowserPanelActions;
  contextMenu: ContextMenuState;
  handleTogglePin: () => void;
  handleCopyUrlFromMenu: () => void;
  handleOpenInNewTab: () => void;
  handleOpenInCurrentTab: () => void;
  wrappedHandleCloseTab: (tabId: string) => void;
  handleDoubleClick: (tabId: string, title: string) => void;
}

export function BrowserShell(props: BrowserShellProps) {
  const { stateValue, actionsValue, ...rest } = props;

  return (
    <div className="adl-tool-panel adl-tool-panel--browser">
      <BrowserToolbarArea stateValue={stateValue} actionsValue={actionsValue} />
      <BrowserContentArea stateValue={stateValue} actionsValue={actionsValue} {...rest} />
    </div>
  );
}
