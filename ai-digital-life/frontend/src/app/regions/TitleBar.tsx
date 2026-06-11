import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { AppInfo } from '@ai-digital-life/kernel';
import type { CopyDict } from '../i18n';
import {
  IconClose,
  IconCopy,
  IconEye,
  IconLangEn,
  IconLangZh,
  IconMonitor,
  IconMinus,
  IconMoon,
  IconPanelLeft,
  IconPanelRight,
  IconSearch,
  IconSettings,
  IconSun,
  IconSquare,
} from '../icons';
import logoUrl from '/logo-chatgpt.png?url';
import { useAppStore } from '../stores/slicedStore';
import { isTauriShell } from '../../tauri-bridge';
import { TooltipSimple } from '../components/Tooltip';

interface TitleBarProps {
  t: CopyDict;
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

interface MenuItem {
  id: string;
  label: string;
  shortcut?: string;
  separator?: boolean;
  action?: () => void;
  disabled?: boolean;
}

function MenuDropdown({
  id,
  label,
  open,
  items,
  onToggle,
  onClose,
}: {
  id: string;
  label: string;
  open: boolean;
  items: MenuItem[];
  onToggle: () => void;
  onClose: () => void;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handler = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  return (
    <div ref={wrapperRef} className="adl-menu" data-menu-id={id}>
      <button
        type="button"
        className={`adl-menu__trigger adl-iconstrip__button adl-iconstrip__button--label${open ? ' is-open' : ''}`}
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label}
      </button>
      {open ? (
        <div className="adl-menu__dropdown" role="menu">
          {items.map((item, index) => {
            if (item.separator) {
              return <div key={`sep-${index}`} className="adl-menu__sep" role="separator" />;
            }
            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                className="adl-menu__item"
                disabled={item.disabled}
                onClick={() => {
                  item.action?.();
                  onClose();
                }}
              >
                <span>{item.label}</span>
                {item.shortcut ? <span className="adl-menu__shortcut">{item.shortcut}</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

const TitleBar = React.memo(function TitleBar({
  t,
  appInfo,
  onOpenSettings,
  onTriggerCreateWorkspace,
  onOpenFolder,
  onOpenCommandPalette,
  onCycleTheme,
  onSelectLanguage,
}: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const { leftCollapsed, rightCollapsed, toggleLeft, toggleRight, toggleBoth } = useAppStore(
    useShallow((state) => ({
      leftCollapsed: state.leftCollapsed,
      rightCollapsed: state.rightCollapsed,
      toggleLeft: state.toggleLeft,
      toggleRight: state.toggleRight,
      toggleBoth: state.toggleBoth,
    }))
  );
  const {
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
      fileMenuOpen: state.fileMenuOpen,
      viewMenuOpen: state.viewMenuOpen,
      helpMenuOpen: state.helpMenuOpen,
      setFileMenuOpen: state.setFileMenuOpen,
      setViewMenuOpen: state.setViewMenuOpen,
      setHelpMenuOpen: state.setHelpMenuOpen,
      closeAllMenus: state.closeAllMenus,
      setActiveRightTool: state.setActiveRightTool,
    }))
  );
  const language = appInfo?.config.language ?? 'zh-CN';
  const nextLanguage = language === 'zh-CN' ? 'en-US' : 'zh-CN';

  useEffect(() => {
    if (!isTauriShell()) {
      return;
    }
    let cancelled = false;
    const syncMaximized = async () => {
      try {
        const next = await window.digitalLife.window.isMaximized();
        if (!cancelled) {
          setIsMaximized(next);
        }
      } catch {
        /* ignore */
      }
    };
    void syncMaximized();
    const timer = window.setInterval(syncMaximized, 500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const handleMinimize = useCallback(() => {
    if (!isTauriShell()) {
      return;
    }
    void window.digitalLife.window.minimize();
  }, []);
  const handleMaximize = useCallback(async () => {
    if (!isTauriShell()) {
      return;
    }
    await window.digitalLife.window.maximize();
    try {
      setIsMaximized(await window.digitalLife.window.isMaximized());
    } catch {
      /* ignore */
    }
  }, []);
  const handleClose = useCallback(() => {
    if (!isTauriShell()) {
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

  const fileItems: MenuItem[] = useMemo(
    () => [
      {
        id: 'new-ws',
        label: t.menuNewWorkspace,
        shortcut: 'Ctrl+N',
        action: onTriggerCreateWorkspace,
      },
      { id: 'open-folder', label: t.menuOpenFolder, shortcut: 'Ctrl+O', action: onOpenFolder },
      {
        id: 'new-terminal',
        label: t.menuNewTerminal,
        shortcut: 'Ctrl+Shift+`',
        action: () => setActiveRightTool('terminal'),
      },
      {
        id: 'new-browser',
        label: t.menuNewBrowser,
        action: () => setActiveRightTool('browser'),
      },
      {
        id: 'editor-window',
        label: t.menuOpenEditorWindow,
        action: () => setActiveRightTool('files'),
      },
      { id: 'sep-1', label: '', separator: true },
      { id: 'exit', label: t.menuExit, shortcut: 'Alt+F4', action: handleClose },
    ],
    [t, onTriggerCreateWorkspace, onOpenFolder, handleClose, setActiveRightTool]
  );

  const viewItems: MenuItem[] = useMemo(
    () => [
      {
        id: 'diff-view',
        label: t.menuDiffView,
        action: () => setActiveRightTool('changes'),
      },
      {
        id: 'browser-view',
        label: t.menuBrowserView,
        action: () => setActiveRightTool('browser'),
      },
      {
        id: 'file-view',
        label: t.menuFileView,
        action: () => setActiveRightTool('files'),
      },
      {
        id: 'terminal-view',
        label: t.menuTerminalView,
        action: () => setActiveRightTool('terminal'),
      },
      { id: 'sep-1', label: '', separator: true },
      { id: 'zoom-in', label: t.menuZoomIn, shortcut: 'Ctrl++', action: () => zoomBy(0.1) },
      { id: 'zoom-out', label: t.menuZoomOut, shortcut: 'Ctrl+-', action: () => zoomBy(-0.1) },
      { id: 'zoom-reset', label: t.menuResetZoom, shortcut: 'Ctrl+0', action: resetZoom },
      { id: 'sep-2', label: '', separator: true },
      { id: 'settings', label: t.menuSettings, shortcut: 'Ctrl+,', action: onOpenSettings },
    ],
    [t, zoomBy, resetZoom, onOpenSettings, setActiveRightTool]
  );

  const helpItems: MenuItem[] = useMemo(
    () => [
      {
        id: 'palette',
        label: t.menuCommandPalette,
        shortcut: 'Ctrl+Shift+P',
        action: onOpenCommandPalette,
      },
      { id: 'shortcuts', label: t.menuShortcuts, shortcut: 'Ctrl+K Ctrl+S', action: () => {} },
      { id: 'license', label: t.menuLicense, action: () => {} },
    ],
    [t, onOpenCommandPalette]
  );

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
        <nav className="adl-titlebar__menus adl-iconstrip" aria-label="Application menu">
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
        <div
          className="adl-titlebar__action-group adl-iconstrip"
          role="group"
          aria-label="Titlebar actions"
        >
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
              aria-label={`${t.language}: ${nextLanguage === 'zh-CN' ? '中文' : 'EN'}`}
            >
              <LanguageIcon language={language} />
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.menuSettings} placement="bottom">
            <button
              type="button"
              className="adl-icon-btn adl-iconstrip__button"
              onClick={onOpenSettings}
              aria-label={t.menuSettings}
            >
              <IconSettings size={16} decorative />
            </button>
          </TooltipSimple>
        </div>
        <div
          className="adl-titlebar__panel-group adl-iconstrip"
          role="group"
          aria-label="Panel controls"
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
              <IconPanelLeft size={16} decorative />
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
              <IconPanelRight size={16} decorative />
            </button>
          </TooltipSimple>
        </div>
        <div
          className="adl-titlebar__window-group adl-iconstrip"
          role="group"
          aria-label="Window controls"
        >
          <TooltipSimple content={t.windowMinimize} placement="bottom">
            <button
              type="button"
              className="adl-icon-btn adl-iconstrip__button adl-iconstrip__button--window adl-window-btn"
              onClick={handleMinimize}
              aria-label={t.windowMinimize}
            >
              <IconMinus size={14} decorative />
            </button>
          </TooltipSimple>
          <TooltipSimple
            content={isMaximized ? t.windowRestore : t.windowMaximize}
            placement="bottom"
          >
            <button
              type="button"
              className="adl-icon-btn adl-iconstrip__button adl-iconstrip__button--window adl-window-btn"
              onClick={handleMaximize}
              aria-label={isMaximized ? t.windowRestore : t.windowMaximize}
            >
              {isMaximized ? (
                <IconCopy size={14} decorative />
              ) : (
                <IconSquare size={12} decorative />
              )}
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.windowClose} placement="bottom">
            <button
              type="button"
              className="adl-icon-btn adl-iconstrip__button adl-iconstrip__button--window adl-window-btn adl-window-btn--close"
              onClick={handleClose}
              aria-label={t.windowClose}
            >
              <IconClose size={14} decorative />
            </button>
          </TooltipSimple>
        </div>
      </div>
    </header>
  );
});

export { TitleBar };
