import React, { useState, useRef, useCallback, useEffect } from 'react';
import { IconDownload } from '@icons';
import { TooltipSimple } from '@components/Tooltip';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import { BrowserDownloadMenu } from './BrowserDownloadMenu';

interface BrowserDownloadButtonProps {
  className?: string;
}

export const BrowserDownloadButton = React.memo(function BrowserDownloadButton({
  className,
}: BrowserDownloadButtonProps) {
  const { t } = useTCopy();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const downloads = useAppStore((s) => s.downloads);
  const activeDownloads = useAppStore((s) => s.activeDownloads);

  const activeCount = Object.keys(activeDownloads).length;
  const hasActive = activeCount > 0;

  const activeList = downloads.filter((d) => d.status === 'in_progress');
  const totalBytes = activeList.reduce((sum, d) => sum + (d.total_bytes ?? 0), 0);
  const receivedBytes = activeList.reduce((sum, d) => sum + d.bytes_received, 0);
  const overallProgress = totalBytes > 0 ? receivedBytes / totalBytes : 0;

  const handleToggle = useCallback(() => {
    setMenuOpen((v) => !v);
  }, []);

  const handleClose = useCallback(() => {
    setMenuOpen(false);
  }, []);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  return (
    <div ref={menuRef} className="adl-menu" style={{ position: 'relative' }}>
      <TooltipSimple content={t.browserDownloadTitle} placement="top">
        <button
          ref={buttonRef}
          type="button"
          className={`adl-tool-context__iconbtn${className ? ` ${className}` : ''}`}
          onClick={handleToggle}
          aria-label={t.browserDownloadTitle}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          {hasActive ? (
            <DownloadProgressRing progress={overallProgress} size={14} />
          ) : (
            <IconDownload size={14} decorative />
          )}
          {activeCount > 0 && <span className="adl-download-badge">{activeCount}</span>}
        </button>
      </TooltipSimple>
      {menuOpen && (
        <BrowserDownloadMenu onClose={handleClose} menuRef={menuRef} anchorRef={buttonRef} />
      )}
    </div>
  );
});

function DownloadProgressRing({ progress, size = 14 }: { progress: number; size?: number }) {
  const radius = (size - 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - Math.min(Math.max(progress, 0), 1));

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="adl-download-progress-ring"
      aria-hidden="true"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        opacity={0.2}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.3s ease' }}
      />
    </svg>
  );
}
