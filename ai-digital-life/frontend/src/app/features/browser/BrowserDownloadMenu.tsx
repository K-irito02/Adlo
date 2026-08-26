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
  const completedDownloads = useMemo(
    () => filteredDownloads.filter((d) => d.status === 'completed'),
    [filteredDownloads],
  );
  const failedDownloads = useMemo(
    () =>
      filteredDownloads.filter(
        (d) => d.status === 'failed' || d.status === 'paused' || d.status === 'canceled',
      ),
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
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        menuRef.current &&
        !menuRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
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
  }, [onClose, menuRef]);

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
            <DownloadGroup
              label={t.browserDownloadActive}
              downloads={activeDownloads}
              onContextMenu={handleContextMenu}
            />
          )}
          {completedDownloads.length > 0 && (
            <DownloadGroup
              label={t.browserDownloadCompleted}
              downloads={completedDownloads}
              onContextMenu={handleContextMenu}
            />
          )}
          {failedDownloads.length > 0 && (
            <DownloadGroup
              label={t.browserDownloadFailed}
              downloads={failedDownloads}
              onContextMenu={handleContextMenu}
            />
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
