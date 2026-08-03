import { useCallback, useState } from 'react';
import { readJson, writeJson } from '@stores/shared';

export type HotspotMode = 'full' | 'drill';
export type RankingSortKey = 'changeCount' | 'additions' | 'deletions' | 'net';
export type SortDir = 'asc' | 'desc';

export const FILE_HOTSPOTS_MODE_KEY = 'git-vis:file-hotspots-mode';

export interface FileHotspotsState {
  mode: HotspotMode;
  setMode: (mode: HotspotMode) => void;
  drillPath: string[];
  setDrillPath: (path: string[]) => void;
  sortKey: RankingSortKey;
  sortDir: SortDir;
  setSort: (key: RankingSortKey) => void;
}

export function useFileHotspotsState(): FileHotspotsState {
  const [mode, setModeState] = useState<HotspotMode>(() => {
    const saved = readJson<HotspotMode>(FILE_HOTSPOTS_MODE_KEY, 'full');
    return saved === 'drill' ? 'drill' : 'full';
  });
  const [drillPath, setDrillPath] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<RankingSortKey>('changeCount');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const setMode = useCallback((next: HotspotMode) => {
    setModeState(next);
    writeJson(FILE_HOTSPOTS_MODE_KEY, next);
  }, []);

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
    mode,
    setMode,
    drillPath,
    setDrillPath,
    sortKey,
    sortDir,
    setSort,
  };
}
