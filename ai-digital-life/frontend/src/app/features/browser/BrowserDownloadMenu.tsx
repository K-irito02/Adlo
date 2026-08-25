import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { IconDownload, IconSearch } from '@icons';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { computePopoverPosition } from './searchEnginePopoverPosition';
import { BrowserDownloadItem } from './BrowserDownloadItem';
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

  const downloads = useAppStore((s) => s.downloads);
  const downloadSettings = useAppStore((s) => s.downloadSettings);
  const updateDownloadSettings = useAppStore((s) => s.updateDownloadSettings);
  const clearDownloadHistory = useAppStore((s) => s.clearDownloadHistory);

  const autoSave = downloadSettings.mode === 'auto';

  const handleAutoSaveToggle = useCallback(() => {
    const newMode = autoSave ? 'ask' : 'auto';
    void updateDownloadSettings(newMode);
  }, [autoSave, updateDownloadSettings]);

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
        {hasAnyDownloads && (
          <button
            type="button"
            className="adl-download-menu__clear-btn"
            onClick={() => {
              void clearDownloadHistory();
            }}
          >
            {t.browserClearHistory}
          </button>
        )}
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
      <div className="adl-download-menu__auto-save">
        <button
          type="button"
          className={`adl-settings-toggle${autoSave ? ' is-on' : ''}`}
          role="switch"
          aria-checked={autoSave}
          onClick={handleAutoSaveToggle}
        >
          <span className="adl-settings-toggle__track">
            <span className="adl-settings-toggle__thumb" />
          </span>
        </button>
        <span className="adl-download-menu__auto-save-label">{t.browserDownloadAutoSave}</span>
      </div>
      {!hasAnyDownloads ? (
        <div className="adl-download-menu__empty">
          <IconDownload size={32} decorative className="adl-download-menu__empty-icon" />
          <span className="adl-download-menu__empty-text">{t.browserDownloadNoRecords}</span>
        </div>
      ) : (
        <div className="adl-download-menu__list">
          {activeDownloads.length > 0 && (
            <DownloadGroup label={t.browserDownloadActive} downloads={activeDownloads} />
          )}
          {completedDownloads.length > 0 && (
            <DownloadGroup label={t.browserDownloadCompleted} downloads={completedDownloads} />
          )}
          {failedDownloads.length > 0 && (
            <DownloadGroup label={t.browserDownloadFailed} downloads={failedDownloads} />
          )}
          {filteredDownloads.length === 0 && searchQuery && (
            <div className="adl-download-menu__no-results">{t.browserNoSearchResults}</div>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
});

function DownloadGroup({ label, downloads }: { label: string; downloads: DownloadRecord[] }) {
  return (
    <div className="adl-download-menu__group">
      <div className="adl-download-menu__group-label">{label}</div>
      {downloads.map((record) => (
        <BrowserDownloadItem key={record.id} record={record} />
      ))}
    </div>
  );
}
