import { useCallback, useState } from 'react';

export type HotspotColorMode = 'heat' | 'time';
export type RankingSortKey = 'changeCount' | 'additions' | 'deletions' | 'net';
export type SortDir = 'asc' | 'desc';

export interface FileHotspotsState {
  drillPath: string[];
  setDrillPath: (path: string[]) => void;
  colorMode: HotspotColorMode;
  setColorMode: (mode: HotspotColorMode) => void;
  sortKey: RankingSortKey;
  sortDir: SortDir;
  setSort: (key: RankingSortKey) => void;
}

export function useFileHotspotsState(): FileHotspotsState {
  const [drillPath, setDrillPath] = useState<string[]>([]);
  const [colorMode, setColorMode] = useState<HotspotColorMode>('heat');
  const [sortKey, setSortKey] = useState<RankingSortKey>('changeCount');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const setSort = useCallback(
    (key: RankingSortKey) => {
      if (key === sortKey) {
        setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        return;
      }
      setSortKey(key);
      setSortDir('desc');
    },
    [sortKey],
  );

  return {
    drillPath,
    setDrillPath,
    colorMode,
    setColorMode,
    sortKey,
    sortDir,
    setSort,
  };
}
