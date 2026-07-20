import React, { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { AppInfo } from '@ai-digital-life/kernel';
import { useTCopy } from '../i18n/useTCopy';
import {
  IconEye,
  IconLangEn,
  IconLangZh,
  IconMonitor,
  IconMoon,
  IconPanelLeft,
  IconPanelLeftClose,
  IconPanelRight,
  IconPanelRightClose,
  IconSearch,
  IconSun,
} from '../icons';
import logoUrl from '/logo-chatgpt.png?url';
import { useAppStore } from '../stores/slicedStore';
import { TooltipSimple } from '../components/Tooltip';
import { useFileMenuItems, useViewMenuItems, useHelpMenuItems } from './titleBarMenus';
import { MenuDropdown } from './MenuDropdown';
import { WindowControls } from './WindowControls';
import { TitleBarNotifications } from './TitleBarNotifications';

interface TitleBarProps {
  appInfo?: AppInfo;
  onOpenSettings: () => void;
  onTriggerCreateWorkspace: () => void;
  onOpenFolder: () => void;
  onOpenCommandPalette: () => void;
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
  onOpenCommandPalette,
  onCycleTheme,
  onSelectLanguage,
}: TitleBarProps) {
  const { t } = useTCopy();

  const {
    leftCollapsed,
    rightCollapsed,
    toggleLeft,
    toggleRight,
    toggleBoth,
    fileMenuOpen,
    viewMenuOpen,
    helpMenuOpen,
    setFileMenuOpen,
    setViewMenuOpen,
    setHelpMenuOpen,
    closeAllMenus,
    setActiveRightTool,
  } = useAppStore(
    useShallow((state) => ({
      leftCollapsed: state.leftCollapsed,
      rightCollapsed: state.rightCollapsed,
      toggleLeft: state.toggleLeft,
      toggleRight: state.toggleRight,
      toggleBoth: state.toggleBoth,
      fileMenuOpen: state.fileMenuOpen,
      viewMenuOpen: state.viewMenuOpen,
      helpMenuOpen: state.helpMenuOpen,
      setFileMenuOpen: state.setFileMenuOpen,
      setViewMenuOpen: state.setViewMenuOpen,
      setHelpMenuOpen: state.setHelpMenuOpen,
      closeAllMenus: state.closeAllMenus,
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

  const zoomBy = useCallback((delta: number) => {
    const current = parseFloat(getComputedStyle(document.documentElement).zoom || '1');
    const next = Math.max(0.5, Math.min(2, (Number.isFinite(current) ? current : 1) + delta));
    document.documentElement.style.zoom = String(next);
  }, []);
  const resetZoom = useCallback(() => {
    document.documentElement.style.zoom = '1';
  }, []);

  const fileItems = useFileMenuItems(
    t,
    onTriggerCreateWorkspace,
    onOpenFolder,
    handleClose,
    setActiveRightTool,
  );
  const viewItems = useViewMenuItems(t, zoomBy, resetZoom, onOpenSettings, setActiveRightTool);
  const helpItems = useHelpMenuItems(t, onOpenCommandPalette);

  return (
    <header className="adl-titlebar" role="banner">
      <div className="adl-titlebar__left">
        <div className="adl-titlebar__brand-slot" data-tauri-drag-region>
          <h1 className="adl-titlebar__brand">
            <TooltipSimple content={t.brandHoverName} placement="bottom">
              <img
                src={logoUrl}
                alt={t.landingTitle}
                className="adl-titlebar__logo"
                draggable={false}
              />
            </TooltipSimple>
          </h1>
        </div>
        <nav className="adl-titlebar__menus adl-iconstrip" aria-label={t.appMenu}>
          <MenuDropdown
            id="file"
            label={t.menuFile}
            open={fileMenuOpen}
            items={fileItems}
            onToggle={() => setFileMenuOpen(!fileMenuOpen)}
            onClose={closeAllMenus}
          />
          <MenuDropdown
            id="view"
            label={t.menuView}
            open={viewMenuOpen}
            items={viewItems}
            onToggle={() => setViewMenuOpen(!viewMenuOpen)}
            onClose={closeAllMenus}
          />
          <MenuDropdown
            id="help"
            label={t.menuHelp}
            open={helpMenuOpen}
            items={helpItems}
            onToggle={() => setHelpMenuOpen(!helpMenuOpen)}
            onClose={closeAllMenus}
          />
          <TooltipSimple content={t.menuCommandPalette} placement="bottom">
            <button
              type="button"
              className="adl-icon-btn adl-iconstrip__button"
              onClick={onOpenCommandPalette}
              aria-label={t.menuCommandPalette}
            >
              <IconSearch size={16} decorative />
            </button>
          </TooltipSimple>
        </nav>
      </div>
      <div className="adl-titlebar__drag" aria-hidden="true" data-tauri-drag-region />
      <div className="adl-titlebar__right">
        <div className="adl-titlebar__action-group">
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
