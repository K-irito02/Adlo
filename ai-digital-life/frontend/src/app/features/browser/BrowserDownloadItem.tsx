import React, { useCallback, useRef, useState } from 'react';
import { IconPause, IconPlay, IconClose, IconMoreVertical } from '@icons';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { formatBytes } from '../../../design-system/html';
import type { DownloadRecord } from '@shared/ipc/download';
import { BrowserDownloadPauseDialog } from './BrowserDownloadPauseDialog';
import { FileIcon } from '@shared/file-icon';
import { useDownloadItemActions } from './useDownloadItemActions';

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
  const lastClickTimeRef = useRef(0);

  const { handleOpenFile } = useDownloadItemActions();

  const activeDownloads = useAppStore((s) => s.activeDownloads);
  const pauseDownload = useAppStore((s) => s.pauseDownload);
  const resumeDownload = useAppStore((s) => s.resumeDownload);
  const cancelDownload = useAppStore((s) => s.cancelDownload);

  const [showPauseDialog, setShowPauseDialog] = useState(false);
  const [pendingRecord, setPendingRecord] = useState<DownloadRecord | null>(null);

  const activeProgress = activeDownloads[record.id];
  const isActive = record.status === 'in_progress';
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
      if (rec.resumable === false) {
        setPendingRecord(rec);
        setShowPauseDialog(true);
      } else {
        await pauseDownload(rec.id);
      }
    },
    [pauseDownload],
  );

  const handlePauseConfirm = useCallback(async () => {
    if (pendingRecord) {
      setShowPauseDialog(false);
      await pauseDownload(pendingRecord.id);
      setPendingRecord(null);
    }
  }, [pauseDownload, pendingRecord]);

  const handlePauseCancel = useCallback(() => {
    setShowPauseDialog(false);
    setPendingRecord(null);
  }, []);

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

  const handleClick = useCallback(
    (_e: React.MouseEvent) => {
      const now = Date.now();
      if (now - lastClickTimeRef.current < 300) {
        // 防止重复快速点击
        return;
      }
      lastClickTimeRef.current = now;
      if (record.status === 'completed' || record.status === 'failed') {
        // 只有已完成或失败的下载才尝试打开文件
        void handleOpenFile(record);
      }
    },
    [record, handleOpenFile],
  );

  // Status icons removed per user request - partition titles are sufficient

  const formatDate = (timestamp: number) => {
    // 后端返回的是秒级时间戳，需要转换为毫秒级
    const date = new Date(timestamp * 1000);
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const dateText = (() => {
    // 优先使用完成时间，回退到创建时间
    const timestamp = record.completed_at ?? record.created_at;
    return formatDate(timestamp);
  })();

  const statusText = (() => {
    switch (record.status) {
      case 'in_progress':
        return speed > 0 ? t.browserDownloadSpeed.replace('{speed}', formatBytes(speed)) : '';
      case 'failed':
        return record.interrupt_reason
          ? t.browserDownloadFailedReason.replace('{reason}', record.interrupt_reason)
          : t.browserDownloadFailed;
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
        onClick={handleClick}
        role="listitem"
        aria-label={record.file_name}
      >
        <div className="adl-download-item__content">
          <div className="adl-download-item__header">
            <FileIcon
              fileName={record.file_name}
              size={18}
              className="adl-download-item__file-icon"
            />
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
            <div className="adl-download-item__progress adl-download-item__progress--active">
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
            <span className="adl-download-item__date">{dateText}</span>
          </div>
        </div>
      </div>
      <BrowserDownloadPauseDialog
        open={showPauseDialog}
        fileName={pendingRecord?.file_name ?? ''}
        onConfirm={handlePauseConfirm}
        onCancel={handlePauseCancel}
      />
    </>
  );
});
