import React from 'react';
import { FileHotspotsLeaderboard } from './FileHotspotsLeaderboard';
import type { GitVisFileHotspots } from '@/shared/ipc/workspace';
import type { ChartStatus } from '@/components/charts/chart-phase';
import { useTCopy } from '@i18n/useTCopy';

export interface FileHotspotsViewProps {
  data?: GitVisFileHotspots;
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  status?: ChartStatus;
  loadingLabel?: string;
  /** Whether the current workspace is a Git repository */
  isGitRepo?: boolean;
  /** Whether a workspace is selected */
  hasWorkspace?: boolean;
  /** Whether the git snapshot has been loaded (false during initial async load) */
  isGitSnapshotLoaded?: boolean;
}

export const FileHotspotsView = React.memo(function FileHotspotsView({
  data,
  scrollContainerRef,
  status = 'ready',
  loadingLabel,
  isGitRepo = true,
  hasWorkspace = true,
  isGitSnapshotLoaded = true,
}: FileHotspotsViewProps) {
  const { t } = useTCopy();

  if (!hasWorkspace) {
    return (
      <div className="adl-git-vis__chart adl-git-vis__not-repo-hint">
        <p className="adl-git-vis__not-repo-hint-text">{t.gitVisNoWorkspace}</p>
      </div>
    );
  }

  if (!isGitRepo && isGitSnapshotLoaded) {
    return (
      <div className="adl-git-vis__chart adl-git-vis__not-repo-hint">
        <p className="adl-git-vis__not-repo-hint-text">{t.gitVisNotGitRepo}</p>
      </div>
    );
  }

  return (
    <div className="adl-file-hotspots-view">
      <FileHotspotsLeaderboard
        data={data}
        scrollContainerRef={scrollContainerRef}
        status={status}
        loadingLabel={loadingLabel}
      />
    </div>
  );
});
