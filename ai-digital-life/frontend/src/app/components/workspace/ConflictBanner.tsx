import React from 'react';
import type { CopyDict } from '../../i18n';
import { IconAlertTriangle } from '../../icons';

interface ConflictBannerProps {
  t: CopyDict;
  conflictPaths: string[];
  onReload: () => void;
  onKeep: () => void;
  onViewDiff: (path: string) => void;
}

export function ConflictBanner({
  t,
  conflictPaths,
  onReload,
  onKeep,
  onViewDiff,
}: ConflictBannerProps) {
  if (conflictPaths.length === 0) {
    return null;
  }

  return (
    <div className="adl-conflict-banner" role="alert">
      <div className="adl-conflict-banner__header">
        <IconAlertTriangle size={14} decorative />
        <span>
          {t.conflictDetected} ({conflictPaths.length})
        </span>
      </div>
      <ul className="adl-conflict-banner__files">
        {conflictPaths.map((path) => (
          <li key={path}>
            <span>{path}</span>
            <button
              type="button"
              className="adl-btn adl-btn--ghost adl-btn--xs"
              onClick={() => onViewDiff(path)}
            >
              {t.conflictViewDiff}
            </button>
          </li>
        ))}
      </ul>
      <div className="adl-conflict-banner__actions">
        <button type="button" className="adl-btn adl-btn--primary adl-btn--sm" onClick={onReload}>
          {t.conflictReload}
        </button>
        <button type="button" className="adl-btn adl-btn--ghost adl-btn--sm" onClick={onKeep}>
          {t.conflictKeep}
        </button>
      </div>
    </div>
  );
}
