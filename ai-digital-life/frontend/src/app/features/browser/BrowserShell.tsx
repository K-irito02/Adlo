import { BrowserToolbarArea } from './BrowserToolbarArea';
import { BrowserContentArea } from './BrowserContentArea';
import type { BrowserPanelDialogsProps } from './BrowserPanelDialogs';
import type { ContextMenuState } from './useBrowserMenus';

type DialogProps = Omit<BrowserPanelDialogsProps, 't'>;

interface BrowserShellProps extends DialogProps {
  contextMenu: ContextMenuState;
  handleTogglePin: () => void;
  handleCopyUrlFromMenu: () => void;
  handleOpenInNewTab: () => void;
  handleOpenInCurrentTab: () => void;
  wrappedHandleCloseTab: (tabId: string) => void;
  handleDoubleClick: (tabId: string, title: string) => void;
}

export function BrowserShell(props: BrowserShellProps) {
  return (
    <div className="adl-tool-panel adl-tool-panel--browser">
      <BrowserToolbarArea />
      <BrowserContentArea {...props} />
    </div>
  );
}
