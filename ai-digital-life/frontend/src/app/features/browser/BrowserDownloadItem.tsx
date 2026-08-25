import React, { useCallback, useState, useRef } from 'react';
import { IconCheckCircle, IconXCircle, IconLoader, IconPause, IconMoreVertical } from '@icons';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { formatBytes } from '../../../design-system/html';
import type { DownloadRecord } from '@shared/ipc/download';
import { BrowserDownloadContextMenu } from './BrowserDownloadContextMenu';

interface BrowserDownloadItemProps {
  record: DownloadRecord;
}

export const BrowserDownloadItem = React.memo(function BrowserDownloadItem({
  record,
}: BrowserDownloadItemProps) {
  const { t } = useTCopy();
  const [contextMenu, setContextMenu] = useState<{
    position: { x: number; y: number };
  } | null>(null);
  const itemRef = useRef<HTMLDivElement>(null);

  const activeDownloads = useAppStore((s) => s.activeDownloads);
  const deleteDownloadFile = useAppStore((s) => s.deleteDownloadFile);
  const removeDownloadRecord = useAppStore((s) => s.removeDownloadRecord);

  const activeProgress = activeDownloads[record.id];
  const isActive = record.status === 'in_progress';
  const isCompleted = record.status === 'completed';
  const isFailed = record.status === 'failed';
  const isPaused = record.status === 'paused';

  const bytesReceived = activeProgress?.bytes_received ?? record.bytes_received;
  const speed = activeProgress?.speed ?? 0;
  const totalBytes = record.total_bytes;
  const progress = totalBytes && totalBytes > 0 ? bytesReceived / totalBytes : 0;

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ position: { x: e.clientX, y: e.clientY } });
  }, []);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleOpenFile = useCallback(async (rec: DownloadRecord) => {
    if (!rec.file_path) {
      return;
    }
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('download_open_file', { filePath: rec.file_path });
    } catch {
      // fallback: ignore
    }
  }, []);

  const handleShowInFolder = useCallback(async (rec: DownloadRecord) => {
    if (!rec.file_path) {
      return;
    }
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('download_show_in_folder', { filePath: rec.file_path });
    } catch {
      // fallback: ignore
    }
  }, []);

  const handleDeleteFile = useCallback(
    async (rec: DownloadRecord) => {
      await deleteDownloadFile(rec.id);
    },
    [deleteDownloadFile],
  );

  const handleRemoveRecord = useCallback(
    async (rec: DownloadRecord) => {
      await removeDownloadRecord(rec.id);
    },
    [removeDownloadRecord],
  );

  const handleCopyLink = useCallback(async (rec: DownloadRecord) => {
    try {
      await navigator.clipboard.writeText(rec.url);
    } catch {
      // fallback: ignore
    }
  }, []);

  const statusIcon = (() => {
    if (isActive) {
      return <IconLoader size={14} decorative className="adl-download-item__spinner" />;
    }
    if (isCompleted) {
      return (
        <IconCheckCircle size={14} decorative className="adl-download-item__status--completed" />
      );
    }
    if (isFailed) {
      return <IconXCircle size={14} decorative className="adl-download-item__status--failed" />;
    }
    if (isPaused) {
      return <IconPause size={14} decorative className="adl-download-item__status--paused" />;
    }
    return null;
  })();

  const statusText = (() => {
    switch (record.status) {
      case 'in_progress':
        return speed > 0 ? t.browserDownloadSpeed.replace('{speed}', formatBytes(speed)) : '';
      case 'completed':
        return record.completed_at
          ? t.browserDownloadCompletedAt.replace(
              '{time}',
              new Date(record.completed_at).toLocaleTimeString(),
            )
          : t.browserDownloadCompleted;
      case 'failed':
        return record.interrupt_reason
          ? t.browserDownloadFailedReason.replace('{reason}', record.interrupt_reason)
          : t.browserDownloadFailed;
      case 'paused':
        return t.browserDownloadPaused;
      case 'canceled':
        return t.browserDownloadCanceled;
      default:
        return '';
    }
  })();

  const sizeText = totalBytes
    ? `${formatBytes(bytesReceived)}${t.browserDownloadOf}${formatBytes(totalBytes)}`
    : formatBytes(bytesReceived);

  return (
    <>
      <div
        ref={itemRef}
        className="adl-download-item"
        onContextMenu={handleContextMenu}
        role="listitem"
        aria-label={record.file_name}
      >
        <div className="adl-download-item__icon">{statusIcon}</div>
        <div className="adl-download-item__content">
          <div className="adl-download-item__header">
            <span className="adl-download-item__name" title={record.file_name}>
              {record.file_name}
            </span>
            <button
              type="button"
              className="adl-download-item__menu-btn"
              onClick={(e) => {
                e.stopPropagation();
                setContextMenu({
                  position: { x: e.clientX, y: e.clientY },
                });
              }}
              aria-label={t.browserContextMore}
            >
              <IconMoreVertical size={14} decorative />
            </button>
          </div>
          {isActive && (
            <div className="adl-download-item__progress">
              <div className="adl-download-item__progress-bar">
                <div
                  className="adl-download-item__progress-fill"
                  style={{ width: `${Math.min(progress * 100, 100)}%` }}
                />
              </div>
            </div>
          )}
          <div className="adl-download-item__meta">
            <span className="adl-download-item__size">{sizeText}</span>
            {statusText && <span className="adl-download-item__status">{statusText}</span>}
          </div>
        </div>
      </div>
      {contextMenu && (
        <BrowserDownloadContextMenu
          record={record}
          position={contextMenu.position}
          onClose={handleCloseContextMenu}
          onOpenFile={handleOpenFile}
          onShowInFolder={handleShowInFolder}
          onDeleteFile={handleDeleteFile}
          onRemoveRecord={handleRemoveRecord}
          onCopyLink={handleCopyLink}
        />
      )}
    </>
  );
});
