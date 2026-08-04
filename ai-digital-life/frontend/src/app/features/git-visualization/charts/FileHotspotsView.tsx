import React from 'react';
import { FileHotspotsLeaderboard } from './FileHotspotsLeaderboard';
import type { GitVisFileHotspots } from '@/shared/ipc/workspace';
import type { ChartStatus } from '@/components/charts/chart-phase';

export interface FileHotspotsViewProps {
  data?: GitVisFileHotspots;
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  status?: ChartStatus;
  loadingLabel?: string;
}

export const FileHotspotsView = React.memo(function FileHotspotsView({
  data,
  scrollContainerRef,
  status = 'ready',
  loadingLabel,
}: FileHotspotsViewProps) {
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
