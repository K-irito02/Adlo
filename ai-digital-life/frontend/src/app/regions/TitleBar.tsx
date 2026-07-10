import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { AppInfo } from '@ai-digital-life/kernel';
import { useTCopy } from '../i18n/useTCopy';
import {
  IconBell,
  IconClose,
  IconCopy,
  IconEye,
  IconLangEn,
  IconLangZh,
  IconMonitor,
  IconMinus,
  IconMoon,
  IconPanelLeft,
  IconPanelLeftClose,
  IconPanelRight,
  IconPanelRightClose,
  IconSearch,
  IconSun,
  IconSquare,
} from '../icons';
import logoUrl from '/logo-chatgpt.png?url';
import { useAppStore } from '../stores/slicedStore';
import { isTauriShell } from '../../tauri-bridge';
import { TooltipSimple } from '../components/Tooltip';
import { NotificationCard } from '../components/NotificationCard';
import { useFileMenuItems, useViewMenuItems, useHelpMenuItems } from './titleBarMenus';
import type { MenuItem } from './titleBarMenus';

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
  appInfo,
  onOpenSettings,
  onTriggerCreateWorkspace,
  onOpenFolder,
  onOpenCommandPalette,
  onCycleTheme,
  onSelectLanguage,
}: TitleBarProps) {
  const { t } = useTCopy();
  const notifications = useAppStore((s) => s.notifications);
  const removeNotification = useAppStore((s) => s.removeNotification);
  const markAllAsRead = useAppStore((s) => s.markAllAsRead);
  const clearAll = useAppStore((s) => s.clearAll);
  const setReadByVisibility = useAppStore((s) => s.setReadByVisibility);
  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const notifListRef = useRef<HTMLDivElement>(null);

  const toggleNotifDropdown = useCallback(() => {
    setNotifOpen((v) => !v);
  }, []);

  // close on outside click
  useEffect(() => {
    if (!notifOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [notifOpen]);

  // close on Escape
  useEffect(() => {
    if (!notifOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNotifOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [notifOpen]);

  // IntersectionObserver for read tracking — rAF-batched to avoid scroll jank
  const seenIdsRef = useRef(new Set<string>());
  const rafRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!notifOpen || !notifListRef.current) return;
    const container = notifListRef.current;
    const cards = container.querySelectorAll('[data-notif-id]');
    if (cards.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const newIds: string[] = [];
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const id = (e.target as HTMLElement).getAttribute('data-notif-id');
          if (id && !seenIdsRef.current.has(id)) {
            seenIdsRef.current.add(id);
            newIds.push(id);
          }
        }
        if (newIds.length > 0) {
          if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
          rafRef.current = requestAnimationFrame(() => {
            setReadByVisibility(newIds);
            rafRef.current = undefined;
          });
        }
      },
      { root: container, threshold: 0.5 }
    );
    cards.forEach((el) => observer.observe(el));
    return () => {
      observer.disconnect();
      seenIdsRef.current.clear();
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
    };
  }, [notifOpen, setReadByVisibility]);

  // Drag-to-scroll on notification body
  const dragRef = useRef<{ startY: number; startScroll: number; dragging: boolean } | null>(null);
  const handleBodyMouseDown = useCallback((e: React.MouseEvent) => {
    if (!notifListRef.current) return;
    dragRef.current = { startY: e.clientY, startScroll: notifListRef.current.scrollTop, dragging: false };
  }, []);
  useEffect(() => {
    if (!notifOpen) return;
    const el = notifListRef.current;
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current || !el) return;
      const dy = e.clientY - dragRef.current.startY;
      if (Math.abs(dy) > 3) dragRef.current.dragging = true;
      if (dragRef.current.dragging) {
        el.scrollTop = dragRef.current.startScroll - dy;
      }
    };
    const onUp = () => { dragRef.current = null; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [notifOpen]);

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
    const unsub = window.digitalLife.window.onResized(syncMaximized);
    return () => {
      cancelled = true;
      unsub();
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

  const fileItems = useFileMenuItems(
    t,
    onTriggerCreateWorkspace,
    onOpenFolder,
    handleClose,
    setActiveRightTool
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
        <div className="adl-titlebar__action-group" ref={notifRef}>
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
          <div className="adl-notif-wrapper" style={{ position: 'relative', display: 'inline-flex' }}>
            <TooltipSimple content={t.notifTitle as string} placement="bottom">
              <button
                type="button"
                className="adl-icon-btn adl-iconstrip__button"
                onClick={toggleNotifDropdown}
                aria-label={t.notifTitle as string}
                style={{ position: 'relative' }}
              >
                <IconBell size={16} decorative />
                {unreadCount > 0 && (
                  <span className="adl-notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
                )}
              </button>
            </TooltipSimple>
            {notifOpen && (
              <div className="adl-notif-dropdown">
                <div className="adl-notif-dropdown__header">
                  <span className="adl-notif-dropdown__title">{t.notifTitle}</span>
                  <div className="adl-notif-dropdown__actions">
                    <button type="button" className="adl-notif-dropdown__action-btn" onClick={() => { markAllAsRead(); setNotifOpen(false); }}>
                      {t.notifMarkAllRead}
                    </button>
                    <button type="button" className="adl-notif-dropdown__action-btn" onClick={() => { clearAll(); setNotifOpen(false); }}>
                      {t.notifClearAll}
                    </button>
                  </div>
                </div>
                <div className="adl-notif-dropdown__body" ref={notifListRef} onMouseDown={handleBodyMouseDown}>
                  {notifications.length === 0 ? (
                    <div className="adl-notif-dropdown__empty">{t.notifEmpty}</div>
                  ) : (
                    notifications.map((n) => (
                      <div key={n.id} data-notif-id={n.id}>
                        <NotificationCard
                          notification={n}
                          onClose={(id) => {
                            removeNotification(id);
                          }}
                        />
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
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
