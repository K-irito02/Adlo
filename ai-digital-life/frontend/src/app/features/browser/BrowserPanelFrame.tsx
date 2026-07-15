import { BrowserToolbar } from './BrowserToolbar';
import { BrowserNavigator } from './BrowserNavigator';
import { BrowserIframeStack } from './BrowserIframeStack';
import { BrowserContextMenu } from './BrowserContextMenu';
import { BrowserPanelDialogs } from './BrowserPanelDialogs';
import type { BrowserPanelDialogsProps } from './BrowserPanelDialogs';
import { BrowserPanelStateCtx } from './BrowserPanelStateContext';
import type { BrowserPanelState } from './BrowserPanelStateContext';
import { BrowserPanelActionsCtx } from './BrowserPanelActionsContext';
import type { BrowserPanelActions } from './BrowserPanelActionsContext';
import type { ContextMenuState } from './useBrowserMenus';
import { handleRenameFromContextMenu, handleDeleteFromContextMenu } from './browserPanelHelpers';

type DialogProps = Omit<BrowserPanelDialogsProps, 't'>;

export interface BrowserPanelFrameProps extends DialogProps {
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

export function BrowserPanelFrame(props: BrowserPanelFrameProps) {
  const { stateValue, actionsValue } = props;
  const { t, browserTabs, browserNavigatorWidth, navigatorCollapsed, primaryRef } = stateValue;

  return (
    <BrowserPanelStateCtx.Provider value={stateValue}>
      <BrowserPanelActionsCtx.Provider value={actionsValue}>
        <div className="adl-tool-panel adl-tool-panel--browser">
          <BrowserToolbar />
          <div
            className={`adl-tool-surface adl-tool-surface--files${navigatorCollapsed ? ' is-navigator-collapsed' : ''}`}
            style={{ '--adl-files-nav-width': `${browserNavigatorWidth}px` } as React.CSSProperties}
          >
            <BrowserNavigator />
            <div className="adl-tool-primary adl-tool-primary--browser" ref={primaryRef}>
              <BrowserIframeStack />
            </div>
          </div>
          <BrowserContextMenu
            contextMenu={props.contextMenu}
            onTogglePin={props.handleTogglePin}
            onRename={handleRenameFromContextMenu(
              browserTabs,
              props.contextMenu,
              props.handleDoubleClick
            )}
            onDelete={handleDeleteFromContextMenu(props.contextMenu, props.wrappedHandleCloseTab)}
            onCopyUrl={props.handleCopyUrlFromMenu}
            onOpenInNewTab={props.handleOpenInNewTab}
            onOpenInCurrentTab={props.handleOpenInCurrentTab}
            onEdit={handleRenameFromContextMenu(
              browserTabs,
              props.contextMenu,
              props.handleDoubleClick
            )}
            onCut={() => {}}
          />

          <BrowserPanelDialogs
            t={t}
            createTabDialog={props.createTabDialog}
            editTabDialog={props.editTabDialog}
            isCreatingTab={props.isCreatingTab}
            handleCreateTabConfirm={props.handleCreateTabConfirm}
            handleCreateTabCancel={props.handleCreateTabCancel}
            handleEditTabConfirm={props.handleEditTabConfirm}
            handleEditTabCancel={props.handleEditTabCancel}
            bookmarkDialogOpen={props.bookmarkDialogOpen}
            bookmarkTreeData={props.bookmarkTreeData}
            handleBookmarkAddToFolder={props.handleBookmarkAddToFolder}
            handleBookmarkCreateDir={props.handleBookmarkCreateDir}
            setBookmarkDialogOpen={props.setBookmarkDialogOpen}
            setBookmarkName={props.setBookmarkName}
            bookmarkName={props.bookmarkName}
            renameFolderState={props.renameFolderState}
            setRenameFolderState={props.setRenameFolderState}
            createDirDialog={props.createDirDialog}
            setCreateDirDialog={props.setCreateDirDialog}
            toastMessages={props.toastMessages}
            removeToast={props.removeToast}
          />
        </div>
      </BrowserPanelActionsCtx.Provider>
    </BrowserPanelStateCtx.Provider>
  );
}
