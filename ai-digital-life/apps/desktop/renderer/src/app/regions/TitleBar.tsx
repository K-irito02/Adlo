import React, { useCallback, useEffect, useRef, useState } from "react";
import type { AppInfo } from "@ai-digital-life/kernel";
import type { CopyDict } from "../copy";
import {
  IconClose,
  IconCopy,
  IconEye,
  IconMinus,
  IconPanelLeft,
  IconPanelRight,
  IconSettings,
  IconSquare
} from "../icons";
import logoUrl from "/logo.png?url";
import { useUiStore } from "../ui-store";
import { TooltipSimple } from "../components/Tooltip";

interface TitleBarProps {
  t: CopyDict;
  appInfo?: AppInfo;
  onOpenSettings: () => void;
  onTriggerCreateWorkspace: () => void;
  onOpenCommandPalette: () => void;
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
  onClose
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
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  return (
    <div ref={wrapperRef} className="adl-menu" data-menu-id={id}>
      <button
        type="button"
        className={`adl-menu__trigger${open ? " is-open" : ""}`}
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

export function TitleBar({
  t,
  appInfo: _appInfo,
  onOpenSettings,
  onTriggerCreateWorkspace,
  onOpenCommandPalette
}: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);
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
    closeAllMenus
  } = useUiStore();

  useEffect(() => {
    let cancelled = false;
    const syncMaximized = async () => {
      try {
        const next = await window.digitalLife.window.isMaximized();
        if (!cancelled) setIsMaximized(next);
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

  const handleMinimize = useCallback(() => void window.digitalLife.window.minimize(), []);
  const handleMaximize = useCallback(async () => {
    await window.digitalLife.window.maximize();
    try {
      setIsMaximized(await window.digitalLife.window.isMaximized());
    } catch {
      /* ignore */
    }
  }, []);
  const handleClose = useCallback(() => void window.digitalLife.window.close(), []);

  const zoomBy = useCallback((delta: number) => {
    const current = parseFloat(getComputedStyle(document.documentElement).zoom || "1");
    const next = Math.max(0.5, Math.min(2, (Number.isFinite(current) ? current : 1) + delta));
    document.documentElement.style.zoom = String(next);
  }, []);
  const resetZoom = useCallback(() => {
    document.documentElement.style.zoom = "1";
  }, []);

  const fileItems: MenuItem[] = [
    { id: "new-ws", label: t.menuNewWorkspace, shortcut: "Ctrl+N", action: onTriggerCreateWorkspace },
    { id: "open-folder", label: t.menuOpenFolder, shortcut: "Ctrl+O", action: onTriggerCreateWorkspace },
    { id: "new-terminal", label: t.menuNewTerminal, shortcut: "Ctrl+Shift+`", action: () => useUiStore.getState().setActiveTool("terminal") },
    { id: "new-browser", label: t.menuNewBrowser, action: () => useUiStore.getState().setActiveTool("browser") },
    { id: "editor-window", label: t.menuOpenEditorWindow, action: () => useUiStore.getState().setActiveTool("files") },
    { id: "sep-1", label: "", separator: true },
    { id: "exit", label: t.menuExit, shortcut: "Alt+F4", action: handleClose }
  ];

  const viewItems: MenuItem[] = [
    { id: "diff-view", label: t.menuDiffView, action: () => useUiStore.getState().setActiveTool("changes") },
    { id: "browser-view", label: t.menuBrowserView, action: () => useUiStore.getState().setActiveTool("browser") },
    { id: "file-view", label: t.menuFileView, action: () => useUiStore.getState().setActiveTool("files") },
    { id: "terminal-view", label: t.menuTerminalView, action: () => useUiStore.getState().setActiveTool("terminal") },
    { id: "sep-1", label: "", separator: true },
    { id: "zoom-in", label: t.menuZoomIn, shortcut: "Ctrl++", action: () => zoomBy(0.1) },
    { id: "zoom-out", label: t.menuZoomOut, shortcut: "Ctrl+-", action: () => zoomBy(-0.1) },
    { id: "zoom-reset", label: t.menuResetZoom, shortcut: "Ctrl+0", action: resetZoom },
    { id: "sep-2", label: "", separator: true },
    { id: "settings", label: t.menuSettings, shortcut: "Ctrl+,", action: onOpenSettings }
  ];

  const helpItems: MenuItem[] = [
    { id: "palette", label: t.menuCommandPalette, shortcut: "Ctrl+Shift+P", action: onOpenCommandPalette },
    { id: "shortcuts", label: t.menuShortcuts, shortcut: "Ctrl+K Ctrl+S", action: () => {} },
    { id: "license", label: t.menuLicense, action: () => {} }
  ];

  return (
    <header className="adl-titlebar" role="banner">
      <div className="adl-titlebar__left">
        <h1 className="adl-titlebar__brand">
          <TooltipSimple content={t.brandHoverName} placement="bottom">
            <img src={logoUrl} alt={t.landingTitle} className="adl-titlebar__logo" draggable={false} />
          </TooltipSimple>
        </h1>
        <nav className="adl-titlebar__menus" aria-label="Application menu">
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
        </nav>
      </div>
      <div className="adl-titlebar__drag" aria-hidden="true" />
      <div className="adl-titlebar__right">
        <TooltipSimple content={t.menuSettings} placement="bottom">
          <button
            type="button"
            className="adl-icon-btn"
            onClick={onOpenSettings}
            aria-label={t.menuSettings}
          >
            <IconSettings size={16} decorative />
          </button>
        </TooltipSimple>
        <div className="adl-titlebar__panel-group" role="group" aria-label="Panel controls">
          <TooltipSimple content={t.panelToggleBoth} placement="bottom">
            <button
              type="button"
              className="adl-icon-btn"
              onClick={toggleBoth}
              aria-label={t.panelToggleBoth}
            >
              <IconEye size={16} decorative />
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.panelToggleLeft} placement="bottom">
            <button
              type="button"
              className={`adl-icon-btn${leftCollapsed ? " is-toggled" : ""}`}
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
              className={`adl-icon-btn${rightCollapsed ? " is-toggled" : ""}`}
              onClick={toggleRight}
              aria-label={t.panelToggleRight}
              aria-pressed={rightCollapsed}
            >
              <IconPanelRight size={16} decorative />
            </button>
          </TooltipSimple>
        </div>
        <div className="adl-titlebar__window-group" role="group" aria-label="Window controls">
          <TooltipSimple content={t.windowMinimize} placement="bottom">
            <button
              type="button"
              className="adl-icon-btn adl-window-btn"
              onClick={handleMinimize}
              aria-label={t.windowMinimize}
            >
              <IconMinus size={14} decorative />
            </button>
          </TooltipSimple>
          <TooltipSimple content={isMaximized ? t.windowRestore : t.windowMaximize} placement="bottom">
            <button
              type="button"
              className="adl-icon-btn adl-window-btn"
              onClick={handleMaximize}
              aria-label={isMaximized ? t.windowRestore : t.windowMaximize}
            >
              {isMaximized ? <IconCopy size={14} decorative /> : <IconSquare size={12} decorative />}
            </button>
          </TooltipSimple>
          <TooltipSimple content={t.windowClose} placement="bottom">
            <button
              type="button"
              className="adl-icon-btn adl-window-btn adl-window-btn--close"
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
}
