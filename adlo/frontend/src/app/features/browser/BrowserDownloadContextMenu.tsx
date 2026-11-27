import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  IconDownload,
  IconFolderOpen,
  IconDelete,
  IconTrash,
  IconCopy,
  IconRefreshCw,
} from '@icons';
import { useTCopy } from '@i18n/useTCopy';
import type { DownloadRecord, DownloadFileState } from '@shared/ipc/download';

interface BrowserDownloadContextMenuProps {
  record: DownloadRecord | null;
  position: { x: number; y: number } | null;
  onClose: () => void;
  onOpenFile: (record: DownloadRecord) => void;
  onShowInFolder: (record: DownloadRecord) => void;
  onDeleteFile: (record: DownloadRecord) => void;
  onRemoveRecord: (record: DownloadRecord) => void;
  onCopyLink: (record: DownloadRecord) => void;
  onRedownload: (record: DownloadRecord) => void;
  /** File system state, when known, used to detect completed-but-missing files. */
  fileState?: DownloadFileState;
  /** Whether the record is currently in the re-download preparing flow. */
  redownloading?: boolean;
  /** Expose the portal DOM element so the parent can exclude it from outside-click detection. */
  onPortalRef?: (el: HTMLDivElement | null) => void;
}

export const BrowserDownloadContextMenu = React.memo(function BrowserDownloadContextMenu({
  record,
  position,
  onClose,
  onOpenFile,
  onShowInFolder,
  onDeleteFile,
  onRemoveRecord,
  onCopyLink,
  onRedownload,
  fileState,
  redownloading,
  onPortalRef,
}: BrowserDownloadContextMenuProps) {
  const { t } = useTCopy();
  const menuRef = useRef<HTMLDivElement>(null);
  const EDGE_PADDING = 8;

  // Boundary detection: shift menu left if it would overflow the right edge
  useEffect(() => {
    if (!position || !menuRef.current) {
      return;
    }
    const el = menuRef.current;
    const rect = el.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    if (rect.right > viewportWidth) {
      const shift = rect.right - viewportWidth + EDGE_PADDING;
      el.style.left = `${position.x - shift}px`;
    }
    // Also ensure it doesn't overflow the bottom
    if (rect.bottom > window.innerHeight) {
      const shift = rect.bottom - window.innerHeight + EDGE_PADDING;
      el.style.top = `${position.y - shift}px`;
    }
  }, [position]);

  // Click-outside dismiss: close when clicking outside the context menu
  useEffect(() => {
    if (!position) {
      return;
    }
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Use mousedown (not click) to match native context menu timing.
    // Delay listener attachment to avoid closing on the same mousedown that
    // opened the context menu (the event is still bubbling to window).
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', handleMouseDown);
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousedown', handleMouseDown);
    };
  }, [position, onClose]);

  // Expose portal DOM element to parent for outside-click exclusion
  useLayoutEffect(() => {
    if (onPortalRef && menuRef.current) {
      onPortalRef(menuRef.current);
    }
    return () => {
      onPortalRef?.(null);
    };
  }, [onPortalRef]);

  if (!record || !position) {
    return null;
  }

  const isHttp = /^https?:\/\//i.test(record.url);
  const showCopyLink = isHttp;

  const isMissingCompleted =
    record.status === 'completed' && fileState !== undefined && !fileState.exists;
  const canRedownload =
    isHttp && (isMissingCompleted || record.status === 'failed' || record.status === 'canceled');

  const showOpenActions = record.status === 'completed' && record.file_path && !isMissingCompleted;
  const showDeleteFile = record.file_path && !isMissingCompleted;

  return createPortal(
    <div
      ref={menuRef}
      className="adl-sidebar-menu"
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 'var(--z-toast-top)',
      }}
      role="menu"
    >
      {canRedownload && (
        <button
          type="button"
          className="adl-sidebar-menu__item"
          role="menuitem"
          onClick={() => {
            onRedownload(record);
            onClose();
          }}
          disabled={redownloading}
        >
          <span className="adl-sidebar-menu__icon">
            <IconRefreshCw size={16} decorative />
          </span>
          <span>{t.browserDownloadRedownload}</span>
        </button>
      )}
      {showOpenActions && (
        <>
          <button
            type="button"
            className="adl-sidebar-menu__item"
            role="menuitem"
            onClick={() => {
              onOpenFile(record);
              onClose();
            }}
          >
            <span className="adl-sidebar-menu__icon">
              <IconDownload size={16} decorative />
            </span>
            <span>{t.browserDownloadOpenFile}</span>
          </button>
          <button
            type="button"
            className="adl-sidebar-menu__item"
            role="menuitem"
            onClick={() => {
              onShowInFolder(record);
              onClose();
            }}
          >
            <span className="adl-sidebar-menu__icon">
              <IconFolderOpen size={16} decorative />
            </span>
            <span>{t.browserDownloadShowInFolder}</span>
          </button>
          <div className="adl-sidebar-menu__sep" role="separator" />
        </>
      )}
      {showCopyLink && (
        <button
          type="button"
          className="adl-sidebar-menu__item"
          role="menuitem"
          onClick={() => {
            onCopyLink(record);
            onClose();
          }}
        >
          <span className="adl-sidebar-menu__icon">
            <IconCopy size={16} decorative />
          </span>
          <span>{t.browserDownloadCopyLink}</span>
        </button>
      )}
      <div className="adl-sidebar-menu__sep" role="separator" />
      <button
        type="button"
        className="adl-sidebar-menu__item"
        role="menuitem"
        onClick={() => {
          onRemoveRecord(record);
          onClose();
        }}
      >
        <span className="adl-sidebar-menu__icon">
          <IconTrash size={16} decorative />
        </span>
        <span>{t.browserDownloadRemoveRecord}</span>
      </button>
      {showDeleteFile && (
        <button
          type="button"
          className="adl-sidebar-menu__item is-danger"
          role="menuitem"
          onClick={() => {
            onDeleteFile(record);
            onClose();
          }}
        >
          <span className="adl-sidebar-menu__icon">
            <IconDelete size={16} decorative />
          </span>
          <span>{t.browserDownloadDeleteFile}</span>
        </button>
      )}
    </div>,
    document.body,
  );
});
