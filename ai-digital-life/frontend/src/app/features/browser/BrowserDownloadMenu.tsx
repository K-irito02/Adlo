import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { IconDownload, IconSearch } from '@icons';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { computePopoverPosition } from './searchEnginePopoverPosition';
import { BrowserDownloadItem } from './BrowserDownloadItem';
import { BrowserDownloadContextMenu } from './BrowserDownloadContextMenu';
import { useDownloadItemActions } from './useDownloadItemActions';
import type { DownloadRecord } from '@shared/ipc/download';

import './BrowserDownloadMenu.css';

interface BrowserDownloadMenuProps {
  onClose: () => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}

export const BrowserDownloadMenu = React.memo(function BrowserDownloadMenu({
  onClose,
  menuRef,
  anchorRef,
}: BrowserDownloadMenuProps) {
  const { t } = useTCopy();
  const popoverRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const [popoverVisible, setPopoverVisible] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    record: DownloadRecord;
    position: { x: number; y: number };
  } | null>(null);
  // Ref to the context menu's portal DOM element, used to exclude it from
  // the download menu's outside-click detection.
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const handleContextMenuPortalRef = useCallback((el: HTMLDivElement | null) => {
    contextMenuRef.current = el;
  }, []);

  const downloads = useAppStore((s) => s.downloads);
  const downloadSettings = useAppStore((s) => s.downloadSettings);
  const updateDownloadSettings = useAppStore((s) => s.updateDownloadSettings);
  const clearDownloadHistory = useAppStore((s) => s.clearDownloadHistory);
  const setActiveSettingsGroup = useAppStore((s) => s.setActiveSettingsGroup);
  const setActiveRightTool = useAppStore((s) => s.setActiveRightTool);

  const {
    handleOpenFile,
    handleShowInFolder,
    handleDeleteFile,
    handleRemoveRecord,
    handleCopyLink,
  } = useDownloadItemActions();

  const autoSave = downloadSettings.mode === 'auto';

  const handleAutoSaveToggle = useCallback(() => {
    const newMode = autoSave ? 'ask' : 'auto';
    void updateDownloadSettings(newMode);
  }, [autoSave, updateDownloadSettings]);

  const handleOpenSettings = useCallback(() => {
    setActiveSettingsGroup('browser');
    setActiveRightTool('settings');
    onClose();
  }, [setActiveSettingsGroup, setActiveRightTool, onClose]);

  const handleOpenFolder = useCallback(async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('download_open_default_folder');
    } catch {
      // fallback: ignore
    }
  }, []);

  const handleClearHistory = useCallback(async () => {
    await clearDownloadHistory();
  }, [clearDownloadHistory]);

  const filteredDownloads = useMemo(() => {
    if (!searchQuery.trim()) {
      return downloads;
    }
    const query = searchQuery.toLowerCase();
    return downloads.filter(
      (d) => d.file_name.toLowerCase().includes(query) || d.url.toLowerCase().includes(query),
    );
  }, [downloads, searchQuery]);

  const activeDownloads = useMemo(
    () => filteredDownloads.filter((d) => d.status === 'in_progress'),
    [filteredDownloads],
  );
  const pausedDownloads = useMemo(
    () => filteredDownloads.filter((d) => d.status === 'paused'),
    [filteredDownloads],
  );
  const failedDownloads = useMemo(
    () => filteredDownloads.filter((d) => d.status === 'failed'),
    [filteredDownloads],
  );
  const completedDownloads = useMemo(
    () => filteredDownloads.filter((d) => d.status === 'completed'),
    [filteredDownloads],
  );
  const canceledDownloads = useMemo(
    () => filteredDownloads.filter((d) => d.status === 'canceled'),
    [filteredDownloads],
  );

  const handleContextMenu = useCallback(
    (record: DownloadRecord, position: { x: number; y: number }) => {
      setContextMenu({ record, position });
    },
    [],
  );

  const hasAnyDownloads = downloads.length > 0;

  useEffect(() => {
    const measure = () => {
      const pop = popoverRef.current;
      if (!pop) {
        return;
      }
      setMeasuredWidth(pop.offsetWidth);
      setPopoverVisible(true);
    };
    const raf = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
    };
  }, []);

  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      // Click inside the download menu → keep open
      if (popoverRef.current?.contains(e.target as Node)) {
        return;
      }
      // Click inside the context menu → keep both open
      if (contextMenuRef.current?.contains(e.target as Node)) {
        return;
      }
      // Click on the anchor button → keep open (toggle behavior)
      if (menuRef.current?.contains(e.target as Node)) {
        return;
      }
      onClose();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, menuRef, contextMenuRef]);

  const anchorRect = anchorRef.current?.getBoundingClientRect();
  const popoverStyle: React.CSSProperties = anchorRect
    ? {
        position: 'fixed',
        ...computePopoverPosition({
          anchorLeft: anchorRect.left,
          anchorRight: anchorRect.right,
          anchorBottom: anchorRect.bottom,
          popoverWidth: measuredWidth,
          viewportWidth: window.innerWidth,
        }),
        zIndex: 'var(--z-toast-top)',
      }
    : {
        position: 'fixed',
        right: 8,
        top: 40,
        zIndex: 'var(--z-toast-top)',
      };

  return createPortal(
    <div
      ref={popoverRef}
      className="adl-download-menu"
      style={{ ...popoverStyle, visibility: popoverVisible ? 'visible' : 'hidden' }}
      role="menu"
    >
      <div className="adl-download-menu__header">
        <span className="adl-download-menu__title">{t.browserDownloadTitle}</span>
        <div className="adl-download-menu__header-actions">
          <button
            type="button"
            className="adl-download-menu__toggle"
            role="switch"
            aria-checked={autoSave}
            title={autoSave ? t.browserDownloadAutoSave : t.browserDownloadAskSave}
            onClick={handleAutoSaveToggle}
          >
            <span className="adl-download-menu__toggle-track">
              <span className="adl-download-menu__toggle-thumb" />
            </span>
          </button>
        </div>
      </div>
      <div className="adl-download-menu__search">
        <span className="adl-download-menu__search-icon">
          <IconSearch size={14} decorative />
        </span>
        <input
          type="search"
          className="adl-download-menu__search-input"
          placeholder={t.browserDownloadSearch}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>
      {!hasAnyDownloads ? (
        <div className="adl-download-menu__empty">
          <IconDownload size={32} decorative className="adl-download-menu__empty-icon" />
          <span className="adl-download-menu__empty-text">{t.browserDownloadNoRecords}</span>
        </div>
      ) : (
        <div className="adl-download-menu__list">
          {activeDownloads.length > 0 && (
            <div>
              <DownloadGroup
                label={t.browserDownloadActive}
                downloads={activeDownloads}
                onContextMenu={handleContextMenu}
              />
            </div>
          )}
          {pausedDownloads.length > 0 && (
            <div>
              <DownloadGroup
                label={t.browserDownloadPaused}
                downloads={pausedDownloads}
                onContextMenu={handleContextMenu}
              />
            </div>
          )}
          {failedDownloads.length > 0 && (
            <div>
              <DownloadGroup
                label={t.browserDownloadFailed}
                downloads={failedDownloads}
                onContextMenu={handleContextMenu}
              />
            </div>
          )}
          {completedDownloads.length > 0 && (
            <div>
              <DownloadGroup
                label={t.browserDownloadCompleted}
                downloads={completedDownloads}
                onContextMenu={handleContextMenu}
              />
            </div>
          )}
          {canceledDownloads.length > 0 && (
            <div>
              <DownloadGroup
                label={t.browserDownloadCanceled}
                downloads={canceledDownloads}
                onContextMenu={handleContextMenu}
              />
            </div>
          )}
          {filteredDownloads.length === 0 && searchQuery && (
            <div className="adl-download-menu__no-results">{t.browserNoSearchResults}</div>
          )}
        </div>
      )}
      <div className="adl-download-menu__footer">
        <button
          type="button"
          className="adl-download-menu__footer-btn"
          onClick={handleOpenSettings}
        >
          {t.browserDownloadSettingsTitle}
        </button>
        <button
          type="button"
          className="adl-download-menu__footer-btn"
          onClick={() => void handleClearHistory()}
        >
          {t.browserClearHistory}
        </button>
        <button
          type="button"
          className="adl-download-menu__footer-btn"
          onClick={() => void handleOpenFolder()}
        >
          {t.browserDownloadOpenFolder}
        </button>
      </div>
      {contextMenu && (
        <BrowserDownloadContextMenu
          record={contextMenu.record}
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
          onOpenFile={handleOpenFile}
          onShowInFolder={handleShowInFolder}
          onDeleteFile={handleDeleteFile}
          onRemoveRecord={handleRemoveRecord}
          onCopyLink={handleCopyLink}
          onPortalRef={handleContextMenuPortalRef}
        />
      )}
    </div>,
    document.body,
  );
});

function DownloadGroup({
  label,
  downloads,
  onContextMenu,
}: {
  label: string;
  downloads: DownloadRecord[];
  onContextMenu: (record: DownloadRecord, position: { x: number; y: number }) => void;
}) {
  return (
    <div className="adl-download-menu__group">
      <div className="adl-download-menu__group-label">{label}</div>
      {downloads.map((record) => (
        <BrowserDownloadItem key={record.id} record={record} onContextMenu={onContextMenu} />
      ))}
    </div>
  );
}
