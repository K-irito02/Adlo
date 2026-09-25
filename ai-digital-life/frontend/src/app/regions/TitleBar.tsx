import React, { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { AppInfo } from '@ai-digital-life/kernel';
import { useTCopy } from '../i18n/useTCopy';
import {
  IconAddWorkspace,
  IconEye,
  IconLangEn,
  IconLangZh,
  IconMonitor,
  IconMoon,
  IconPanelLeft,
  IconPanelLeftClose,
  IconPanelRight,
  IconPanelRightClose,
  IconSun,
} from '../icons';
import { Spinner } from '../components/Spinner';
import { useAppStore } from '../stores/slicedStore';
import { TooltipSimple } from '../components/Tooltip';
import { useFileMenuItems, useViewMenuItems, useHelpMenuItems } from './titleBarMenus';
import { useAppZoom } from '../hooks/useAppZoom';
import { HamburgerMenu } from './HamburgerMenu';
import { WindowControls } from './WindowControls';
import { TitleBarNotifications } from './TitleBarNotifications';

interface TitleBarProps {
  appInfo?: AppInfo;
  onOpenSettings: () => void;
  onTriggerCreateWorkspace: () => void;
  onOpenFolder: () => void;
  isOpeningWorkspace: boolean;
  onCycleTheme: () => void;
  onSelectLanguage: (language: AppInfo['config']['language']) => void;
}

function ThemeIcon({ mode }: { mode: AppInfo['config']['themeMode'] | undefined }) {
  switch (mode) {
    case 'dark':
      return <IconMoon size={16} decorative />;
    case 'light':
      return <IconSun size={16} decorative />;
    default:
      return <IconMonitor size={16} decorative />;
  }
}

function LanguageIcon({ language }: { language: AppInfo['config']['language'] | undefined }) {
  switch (language) {
    case 'en-US':
      return <IconLangEn size={16} decorative />;
    case 'zh-CN':
    default:
      return <IconLangZh size={16} decorative />;
  }
}

const TitleBar = React.memo(function TitleBar({
  appInfo,
  onOpenSettings,
  onTriggerCreateWorkspace,
  onOpenFolder,
  isOpeningWorkspace,
  onCycleTheme,
  onSelectLanguage,
}: TitleBarProps) {
  const { t } = useTCopy();

  const { leftCollapsed, rightCollapsed, toggleLeft, toggleRight, toggleBoth, setActiveRightTool } =
    useAppStore(
      useShallow((state) => ({
        leftCollapsed: state.leftCollapsed,
        rightCollapsed: state.rightCollapsed,
        toggleLeft: state.toggleLeft,
        toggleRight: state.toggleRight,
        toggleBoth: state.toggleBoth,
        setActiveRightTool: state.setActiveRightTool,
      })),
    );
  const language = appInfo?.config.language ?? 'zh-CN';
  const nextLanguage = language === 'zh-CN' ? 'en-US' : 'zh-CN';

  const handleClose = useCallback(() => {
    if (!useAppStore.getState().isTauri) {
      return;
    }
    void window.digitalLife.window.close();
  }, []);

  const { zoomBy, resetZoom } = useAppZoom();

  const keybinds = useAppStore((s) => s.appInfo?.config?.keybinds) ?? {};
  const openShortcutsSettings = useCallback(() => {
    const state = useAppStore.getState();
    state.setActiveRightTool('settings');
    state.setActiveSettingsGroup('shortcuts');
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
    setActiveRightTool,
  );
  const helpItems = useHelpMenuItems(t, openShortcutsSettings);

  return (
    <header className="adl-titlebar" role="banner">
      <div className="adl-titlebar__left">
        <HamburgerMenu t={t} fileItems={fileItems} viewItems={viewItems} helpItems={helpItems} />
      </div>
      <div className="adl-titlebar__drag" aria-hidden="true" data-tauri-drag-region />
      <div className="adl-titlebar__right">
        <div className="adl-titlebar__action-group">
          <TooltipSimple
            content={isOpeningWorkspace ? t.loading : t.addWorkspace}
            placement="bottom"
          >
            <button
              type="button"
              className="adl-icon-btn adl-iconstrip__button"
              onClick={onOpenFolder}
              disabled={isOpeningWorkspace}
              aria-label={isOpeningWorkspace ? t.loading : t.addWorkspace}
            >
              {isOpeningWorkspace ? (
                <Spinner size="sm" speed="fast" />
              ) : (
                <IconAddWorkspace size={16} decorative />
              )}
            </button>
          </TooltipSimple>
          <span className="adl-titlebar__action-divider" aria-hidden="true" />
          <TooltipSimple content={t.theme} placement="bottom">
            <button
              type="button"
              className="adl-icon-btn adl-iconstrip__button"
              onClick={onCycleTheme}
              aria-label={t.theme}
            >
              <ThemeIcon mode={appInfo?.config.themeMode} />
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.language} placement="bottom">
            <button
              type="button"
              className="adl-icon-btn adl-iconstrip__button"
              onClick={() => onSelectLanguage(nextLanguage)}
              aria-label={`${t.language}: ${nextLanguage === 'zh-CN' ? t.languageChinese : t.languageEnglish}`}
            >
              <LanguageIcon language={language} />
            </button>
          </TooltipSimple>
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
              <IconEye size={16} decorative />
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
