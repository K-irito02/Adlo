import React from 'react';
import { FileHotspotsLeaderboard } from './FileHotspotsLeaderboard';
import type { GitVisFileHotspots } from '@/shared/ipc/workspace';
import type { ChartStatus } from '@/components/charts/chart-phase';
import { useTCopy } from '@i18n/useTCopy';
import { GitNotRepoHint } from '../GitNotRepoHint';

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
    return <GitNotRepoHint className="adl-git-vis__chart" message={t.gitVisNoWorkspace} />;
  }

  if (!isGitRepo && isGitSnapshotLoaded) {
    return <GitNotRepoHint className="adl-git-vis__chart" />;
  }

  // The leaderboard renders its own loading affordance from `status`; fold the
  // not-yet-loaded snapshot state into it so this component's guard is symmetric
  // with BranchGraph / CodeLineEvo / CommitTimeline (which treat
  // `!isGitSnapshotLoaded` as loading). Otherwise a future caller passing
  // status='ready' before the snapshot resolves would render an empty list.
  const effectiveStatus: ChartStatus =
    status === 'loading' || !isGitSnapshotLoaded ? 'loading' : status;

  return (
    <div className="adl-file-hotspots-view">
      <FileHotspotsLeaderboard
        data={data}
        scrollContainerRef={scrollContainerRef}
        status={effectiveStatus}
        loadingLabel={loadingLabel}
      />
    </div>
  );
});
