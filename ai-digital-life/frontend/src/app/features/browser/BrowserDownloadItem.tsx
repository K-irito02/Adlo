import React, { useCallback, useRef } from 'react';
import {
  IconCheckCircle,
  IconXCircle,
  IconLoader,
  IconPause,
  IconPlay,
  IconClose,
  IconMoreVertical,
} from '@icons';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { formatBytes } from '../../../design-system/html';
import type { DownloadRecord } from '@shared/ipc/download';

interface BrowserDownloadItemProps {
  record: DownloadRecord;
  onContextMenu: (record: DownloadRecord, position: { x: number; y: number }) => void;
}

export const BrowserDownloadItem = React.memo(function BrowserDownloadItem({
  record,
  onContextMenu,
}: BrowserDownloadItemProps) {
  const { t } = useTCopy();
  const itemRef = useRef<HTMLDivElement>(null);

  const activeDownloads = useAppStore((s) => s.activeDownloads);
  const pauseDownload = useAppStore((s) => s.pauseDownload);
  const resumeDownload = useAppStore((s) => s.resumeDownload);
  const cancelDownload = useAppStore((s) => s.cancelDownload);

  const activeProgress = activeDownloads[record.id];
  const isActive = record.status === 'in_progress';
  const isCompleted = record.status === 'completed';
  const isFailed = record.status === 'failed';
  const isPaused = record.status === 'paused';

  const bytesReceived = activeProgress?.bytes_received ?? record.bytes_received;
  const speed = activeProgress?.speed ?? 0;
  const totalBytes = record.total_bytes;
  const progress = totalBytes && totalBytes > 0 ? bytesReceived / totalBytes : 0;

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onContextMenu(record, { x: e.clientX, y: e.clientY });
    },
    [record, onContextMenu],
  );

  const handlePause = useCallback(
    async (rec: DownloadRecord) => {
      await pauseDownload(rec.id);
    },
    [pauseDownload],
  );

  const handleResume = useCallback(
    async (rec: DownloadRecord) => {
      await resumeDownload(rec.id);
    },
    [resumeDownload],
  );

  const handleCancel = useCallback(
    async (rec: DownloadRecord) => {
      await cancelDownload(rec.id);
    },
    [cancelDownload],
  );

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
          <div className="adl-download-item__actions">
            {isActive && (
              <button
                type="button"
                className="adl-download-item__action-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePause(record);
                }}
                aria-label={t.browserDownloadPause}
                title={t.browserDownloadPause}
              >
                <IconPause size={12} decorative />
              </button>
            )}
            {isPaused && (
              <button
                type="button"
                className="adl-download-item__action-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleResume(record);
                }}
                aria-label={t.browserDownloadResume}
                title={t.browserDownloadResume}
              >
                <IconPlay size={12} decorative />
              </button>
            )}
            {(isActive || isPaused) && (
              <button
                type="button"
                className="adl-download-item__action-btn adl-download-item__action-btn--danger"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCancel(record);
                }}
                aria-label={t.browserDownloadCancel}
                title={t.browserDownloadCancel}
              >
                <IconClose size={12} decorative />
              </button>
            )}
            <button
              type="button"
              className="adl-download-item__menu-btn"
              onClick={(e) => {
                e.stopPropagation();
                onContextMenu(record, { x: e.clientX, y: e.clientY });
              }}
              aria-label={t.browserContextMore}
            >
              <IconMoreVertical size={14} decorative />
            </button>
          </div>
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
  );
});
