import React, { useCallback, useRef } from 'react';
import { FileSunburstChart } from './FileSunburst';
import { FileHotspotsRanking } from './FileHotspotsRanking';
import { useFileHotspotsState } from '../hooks/useFileHotspotsState';
import type { GitVisFileHotspots } from '@/shared/ipc/workspace';

export interface FileHotspotsViewProps {
  data?: GitVisFileHotspots;
}

export const FileHotspotsView = React.memo(function FileHotspotsView({
  data,
}: FileHotspotsViewProps) {
  const state = useFileHotspotsState();
  const { drillPath, setDrillPath, colorMode, sortKey, sortDir, setSort } = state;
  const zoomToRootRef = useRef<(() => void) | null>(null);

  const handleDrill = useCallback(
    (path: string[]) => {
      setDrillPath(path);
    },
    [setDrillPath],
  );

  const handleClearFilter = useCallback(() => {
    setDrillPath([]);
    zoomToRootRef.current?.();
  }, [setDrillPath]);

  return (
    <div className="adl-file-hotspots-view">
      <FileSunburstChart
        data={data}
        colorMode={colorMode}
        onDrill={handleDrill}
        zoomToRootRef={zoomToRootRef}
      />
      <FileHotspotsRanking
        files={data?.files ?? []}
        filterPath={drillPath}
        onClearFilter={handleClearFilter}
        sortState={{ sortKey, sortDir, onSort: setSort }}
      />
    </div>
  );
});
