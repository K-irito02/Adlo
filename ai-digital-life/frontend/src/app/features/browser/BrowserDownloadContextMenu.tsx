import React from 'react';
import { createPortal } from 'react-dom';
import { IconDownload, IconFolderOpen, IconDelete, IconTrash, IconCopy } from '@icons';
import { useTCopy } from '@i18n/useTCopy';
import type { DownloadRecord } from '@shared/ipc/download';

interface BrowserDownloadContextMenuProps {
  record: DownloadRecord | null;
  position: { x: number; y: number } | null;
  onClose: () => void;
  onOpenFile: (record: DownloadRecord) => void;
  onShowInFolder: (record: DownloadRecord) => void;
  onDeleteFile: (record: DownloadRecord) => void;
  onRemoveRecord: (record: DownloadRecord) => void;
  onCopyLink: (record: DownloadRecord) => void;
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
}: BrowserDownloadContextMenuProps) {
  const { t } = useTCopy();

  if (!record || !position) {
    return null;
  }

  return createPortal(
    <div
      className="adl-sidebar-menu"
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 'var(--z-toast-top)',
      }}
      role="menu"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {record.status === 'completed' && record.file_path && (
        <>
          <button
            type="button"
            className="adl-sidebar-menu__item"
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
      <button
        type="button"
        className="adl-sidebar-menu__item"
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
      <div className="adl-sidebar-menu__sep" role="separator" />
      <button
        type="button"
        className="adl-sidebar-menu__item"
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
      {record.file_path && (
        <button
          type="button"
          className="adl-sidebar-menu__item is-danger"
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
