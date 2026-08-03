import React from 'react';
import { FileHotspotsLeaderboard } from './FileHotspotsLeaderboard';
import type { GitVisFileHotspots } from '@/shared/ipc/workspace';

export interface FileHotspotsViewProps {
  data?: GitVisFileHotspots;
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
}

export const FileHotspotsView = React.memo(function FileHotspotsView({
  data,
  scrollContainerRef,
}: FileHotspotsViewProps) {
  return (
    <div className="adl-file-hotspots-view">
      <FileHotspotsLeaderboard data={data} scrollContainerRef={scrollContainerRef} />
    </div>
  );
});
