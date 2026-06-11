import React from 'react';
import type { IndexingStatus } from '@ai-digital-life/kernel';
import type { CopyDict } from '../../i18n';
import { IconCheckCircle, IconAlertTriangle } from '../../icons';

interface IndexStatusProps {
  t: CopyDict;
  status?: IndexingStatus;
  compact?: boolean;
  onRebuild?: () => void;
}

function stateLabel(t: CopyDict, state: IndexingStatus['state']): string {
  const map: Record<IndexingStatus['state'], keyof CopyDict> = {
    idle: 'indexingIdle',
    indexing: 'indexingInProgress',
    indexed: 'indexingCompleted',
    error: 'indexingError',
  };
  return t[map[state]] as string;
}

function stateColorClass(state: IndexingStatus['state']): string {
  switch (state) {
    case 'indexing':
      return 'adl-chip--info';
    case 'indexed':
      return 'adl-chip--success';
    case 'error':
      return 'adl-chip--danger';
    default:
      return 'adl-chip--muted';
  }
}

function formatLastIndexed(t: CopyDict, timestamp?: number): string {
  if (!timestamp) {
    return '';
  }
  const elapsed = Date.now() - timestamp;
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) {
    return `${t.indexLastTime}: <1m`;
  }
  if (minutes < 60) {
    return `${t.indexLastTime}: ${minutes}m`;
  }
  return `${t.indexLastTime}: ${Math.floor(minutes / 60)}h`;
}

export function IndexStatusIndicator({ t, status, compact }: IndexStatusProps) {
  if (!status) {
    return null;
  }

  if (compact) {
    return (
      <span className={`adl-chip adl-chip--xs ${stateColorClass(status.state)}`}>
        {status.state === 'indexing' && (
          <span className="adl-index-status__pulse" aria-hidden="true" />
        )}
        {stateLabel(t, status.state)}
      </span>
    );
  }

  const progress =
    status.totalFiles > 0 ? Math.round((status.scannedFiles / status.totalFiles) * 100) : 0;

  return (
    <div className="adl-index-status">
      <div className="adl-index-status__header">
        {status.state === 'indexed' ? <IconCheckCircle size={14} decorative /> : null}
        {status.state === 'error' ? <IconAlertTriangle size={14} decorative /> : null}
        <span className={`adl-chip adl-chip--xs ${stateColorClass(status.state)}`}>
          {stateLabel(t, status.state)}
        </span>
        {status.lastIndexedAt && (
          <span className="adl-index-status__time">
            {formatLastIndexed(t, status.lastIndexedAt)}
          </span>
        )}
      </div>
      {status.state === 'indexing' && (
        <div className="adl-index-status__bar">
          <div className="adl-index-status__fill" style={{ width: `${progress}%` }} />
        </div>
      )}
      <div className="adl-index-status__meta">
        <span>
          {status.scannedFiles}/{status.totalFiles} {t.indexingFiles}
        </span>
        {status.excludedFiles > 0 && (
          <span className="adl-index-status__excluded">
            {t.indexExcluded}: {status.excludedFiles}
          </span>
        )}
      </div>
    </div>
  );
}

export function IndexStatusBar({ t, status, onRebuild }: IndexStatusProps) {
  if (!status) {
    return null;
  }

  const coverage =
    status.totalFiles > 0 ? Math.round((status.scannedFiles / status.totalFiles) * 100) : 0;

  return (
    <div className="adl-index-bar">
      <div className="adl-index-bar__info">
        <span className={`adl-chip adl-chip--xs ${stateColorClass(status.state)}`}>
          {stateLabel(t, status.state)}
        </span>
        {status.lastIndexedAt && (
          <span className="adl-index-bar__time">{formatLastIndexed(t, status.lastIndexedAt)}</span>
        )}
        <span className="adl-index-bar__coverage">
          {t.indexCoverage}: {coverage}%
        </span>
      </div>
      {onRebuild && (
        <button type="button" className="adl-btn adl-btn--ghost adl-btn--xs" onClick={onRebuild}>
          {t.indexRebuild}
        </button>
      )}
    </div>
  );
}
