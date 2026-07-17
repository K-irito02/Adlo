import { BrowserPanelStateCtx } from './BrowserPanelStateContext';
import { BrowserPanelActionsCtx } from './BrowserPanelActionsContext';
import type { BrowserPanelState } from './BrowserPanelStateContext';
import type { BrowserPanelActions } from './BrowserPanelActionsContext';
import { BrowserNavigator } from './BrowserNavigator';
import { BrowserIframeStack } from './BrowserIframeStack';
import { BrowserContextMenu } from './BrowserContextMenu';
import { BrowserPanelDialogs } from './BrowserPanelDialogs';
import type { BrowserPanelDialogsProps } from './BrowserPanelDialogs';
import { handleRenameFromContextMenu, handleDeleteFromContextMenu } from './browserPanelHelpers';
import type { ContextMenuState } from './useBrowserMenus';
import { useBrowserPanelState } from './BrowserPanelStateContext';

type DialogProps = Omit<BrowserPanelDialogsProps, 't'>;

interface BrowserContentAreaInnerProps extends DialogProps {
  contextMenu: ContextMenuState;
  handleTogglePin: () => void;
  handleCopyUrlFromMenu: () => void;
  handleOpenInNewTab: () => void;
  handleOpenInCurrentTab: () => void;
  wrappedHandleCloseTab: (tabId: string) => void;
  handleDoubleClick: (tabId: string, title: string) => void;
}

export interface BrowserContentAreaProps extends BrowserContentAreaInnerProps {
  stateValue: BrowserPanelState;
  actionsValue: BrowserPanelActions;
}

function BrowserContentAreaInner(props: BrowserContentAreaInnerProps) {
  const stateValue = useBrowserPanelState();
  const { t, browserTabs } = stateValue;

  return (
    <>
      <div
        className={`adl-tool-surface adl-tool-surface--files${stateValue.navigatorCollapsed ? ' is-navigator-collapsed' : ''}`}
        style={
          {
            '--adl-files-nav-width': `${stateValue.browserNavigatorWidth}px`,
          } as React.CSSProperties
        }
      >
        <BrowserNavigator />
        <div className="adl-tool-primary adl-tool-primary--browser" ref={stateValue.primaryRef}>
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
    </>
  );
}

export function BrowserContentArea(props: BrowserContentAreaProps) {
  const { stateValue, actionsValue, ...rest } = props;
  return (
    <BrowserPanelStateCtx.Provider value={stateValue}>
      <BrowserPanelActionsCtx.Provider value={actionsValue}>
        <BrowserContentAreaInner {...rest} />
      </BrowserPanelActionsCtx.Provider>
    </BrowserPanelStateCtx.Provider>
  );
}
