import React, { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTCopy } from '../i18n/useTCopy';
import {
  IconFolderPlus,
  IconPanelLeft,
  IconPanelLeftClose,
  IconPanelRight,
  IconPanelRightClose,
  IconPanelsCollapse,
  IconPanelsExpand,
} from '../icons';
import { Spinner } from '../components/Spinner';
import { useAppStore } from '../stores/slicedStore';
import { TooltipSimple } from '../components/Tooltip';
import { useFileMenuItems, useViewMenuItems, useHelpMenuItems } from './titleBarMenus';
import { EMPTY_KEYBINDS } from '../../shared/keybinds';
import { useAppZoom } from '../hooks/useAppZoom';
import { HamburgerMenu } from './HamburgerMenu';
import { WindowControls } from './WindowControls';
import { TitleBarNotifications } from './TitleBarNotifications';
import { CenterTabStrip } from './CenterTabStrip';

interface TitleBarProps {
  onOpenSettings: () => void;
  onTriggerCreateWorkspace: () => void;
  onOpenFolder: () => void;
  isOpeningWorkspace: boolean;
}

const TitleBar = React.memo(function TitleBar({
  onOpenSettings,
  onTriggerCreateWorkspace,
  onOpenFolder,
  isOpeningWorkspace,
}: TitleBarProps) {
  const { t } = useTCopy();

  const { leftCollapsed, rightCollapsed, toggleLeft, toggleRight, toggleBoth, navigateRightTool } =
    useAppStore(
      useShallow((state) => ({
        leftCollapsed: state.leftCollapsed,
        rightCollapsed: state.rightCollapsed,
        toggleLeft: state.toggleLeft,
        toggleRight: state.toggleRight,
        toggleBoth: state.toggleBoth,
        navigateRightTool: state.navigateRightTool,
      })),
    );
  // toggleBoth 的行为：两侧都折叠 → 同时展开；否则 → 同时折叠。
  // 因此“两侧都折叠”等价于该按钮的“可展开”态，据此切换图标方向。
  const bothCollapsed = leftCollapsed && rightCollapsed;

  const handleClose = useCallback(() => {
    if (!useAppStore.getState().isTauri) {
      return;
    }
    void window.digitalLife.window.close();
  }, []);

  const { zoomBy, resetZoom } = useAppZoom();

  const keybinds = useAppStore((s) => s.appInfo?.config?.keybinds) ?? EMPTY_KEYBINDS;
  const openShortcutsSettings = useCallback(() => {
    useAppStore.getState().openShortcutsSettings();
  }, []);
  const openLicense = useCallback(() => {
    useAppStore.getState().openAboutLicense();
  }, []);
  const fileItems = useFileMenuItems(
    t,
    keybinds,
    onTriggerCreateWorkspace,
    onOpenFolder,
    handleClose,
  );
  const viewItems = useViewMenuItems(
    t,
    keybinds,
    zoomBy,
    resetZoom,
    onOpenSettings,
    navigateRightTool,
  );
  const helpItems = useHelpMenuItems(t, keybinds, openShortcutsSettings, openLicense);

  return (
    <header className="adl-titlebar" role="banner">
      <div className="adl-titlebar__left">
        <HamburgerMenu t={t} fileItems={fileItems} viewItems={viewItems} helpItems={helpItems} />
      </div>
      <CenterTabStrip />
      {/* 拖拽车道：标签占满整条时仍保留窗口拖拽面（24px，永不被标签压缩） */}
      <div className="adl-titlebar__drag-lane" data-tauri-drag-region aria-hidden="true" />
      <div className="adl-titlebar__right">
        <div className="adl-titlebar__action-group">
          <TooltipSimple
            content={isOpeningWorkspace ? t.loading : t.addWorkspace}
            placement="bottom"
          >
            <button
              type="button"
              className={`adl-icon-btn adl-iconstrip__button${isOpeningWorkspace ? ' is-loading' : ''}`}
              onClick={onOpenFolder}
              disabled={isOpeningWorkspace}
              aria-label={isOpeningWorkspace ? t.loading : t.addWorkspace}
            >
              {isOpeningWorkspace ? (
                <Spinner size="sm" speed="fast" />
              ) : (
                <IconFolderPlus size={16} decorative />
              )}
            </button>
          </TooltipSimple>
          <span className="adl-titlebar__action-divider" aria-hidden="true" />
          <TitleBarNotifications t={t} />
        </div>
        <div
          className="adl-titlebar__panel-group adl-iconstrip"
          role="group"
          aria-label={t.panelControls}
        >
          <TooltipSimple content={t.panelToggleBoth} placement="bottom">
            <button
              type="button"
              className="adl-icon-btn adl-iconstrip__button"
              onClick={toggleBoth}
              aria-label={t.panelToggleBoth}
            >
              {bothCollapsed ? (
                <IconPanelsExpand size={16} decorative />
              ) : (
                <IconPanelsCollapse size={16} decorative />
              )}
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.panelToggleLeft} placement="bottom">
            <button
              type="button"
              className="adl-icon-btn adl-iconstrip__button adl-iconstrip__button--paneltoggle"
              onClick={toggleLeft}
              aria-label={t.panelToggleLeft}
              aria-pressed={leftCollapsed}
            >
              {leftCollapsed ? (
                <IconPanelLeftClose size={16} decorative />
              ) : (
                <IconPanelLeft size={16} decorative />
              )}
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.panelToggleRight} placement="bottom">
            <button
              type="button"
              className="adl-icon-btn adl-iconstrip__button adl-iconstrip__button--paneltoggle"
              onClick={toggleRight}
              aria-label={t.panelToggleRight}
              aria-pressed={rightCollapsed}
            >
              {rightCollapsed ? (
                <IconPanelRightClose size={16} decorative />
              ) : (
                <IconPanelRight size={16} decorative />
              )}
            </button>
          </TooltipSimple>
        </div>
        <WindowControls t={t} onClose={handleClose} />
      </div>
    </header>
  );
});

export { TitleBar };
