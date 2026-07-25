import type { StoreState } from '../StoreState';
import { readJson, makePersistedWriter } from '../storageHelpers';

export const GIT_VIS_TIME_RANGE_KEY = 'adl-git-vis:time-range';

const persistTimeRange = makePersistedWriter(GIT_VIS_TIME_RANGE_KEY);

export interface TimeRangeState {
  preset: 'week' | 'month' | 'year' | 'all' | 'custom';
  since?: string;
  until?: string;
}

export function defaultTimeRange(): TimeRangeState {
  const now = new Date();
  const currentYear = now.getFullYear();
  return {
    preset: 'year',
    since: `${currentYear}-01-01`,
    until: `${currentYear}-12-31`,
  };
}

export interface GitVisSlice {
  gitVisData: Record<string, Record<string, unknown>>;
  gitVisLoading: Record<string, Record<string, boolean>>;
  gitVisErrors: Record<string, Record<string, string | undefined>>;
  gitVisTimeRange: Record<string, Record<string, TimeRangeState>>;
  gitVisLoadedPhases: Record<string, 'high' | 'medium' | 'low' | undefined>;

  setGitVisData: (workspaceId: string, chartId: string, data: unknown) => void;
  setGitVisDataBatch: (updates: { workspaceId: string; chartId: string; data: unknown }[]) => void;
  setGitVisLoading: (workspaceId: string, chartId: string, loading: boolean) => void;
  setGitVisError: (workspaceId: string, chartId: string, error: string | undefined) => void;
  setGitVisTimeRange: (workspaceId: string, chartId: string, range: TimeRangeState) => void;
  clearWorkspaceGitVisData: (workspaceId: string) => void;
  setGitVisLoadedPhases: (phases: Record<string, 'high' | 'medium' | 'low' | undefined>) => void;
}

export const createGitVisSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): GitVisSlice => {
  const persistedRaw = readJson<unknown>(GIT_VIS_TIME_RANGE_KEY, {});
  const persisted: Record<string, Record<string, TimeRangeState>> = typeof persistedRaw ===
    'object' &&
  persistedRaw !== null &&
  !Array.isArray(persistedRaw)
    ? (persistedRaw as Record<string, Record<string, TimeRangeState>>)
    : {};
  return {
    gitVisData: {},
    gitVisLoading: {},
    gitVisErrors: {},
    gitVisTimeRange: persisted,
    gitVisLoadedPhases: {},

    setGitVisData: (workspaceId, chartId, data) =>
      set((s) => ({
        gitVisData: {
          ...s.gitVisData,
          [workspaceId]: { ...(s.gitVisData[workspaceId] || {}), [chartId]: data },
        },
      })),
    setGitVisDataBatch: (updates) =>
      set((s) => {
        const newData = { ...s.gitVisData };
        for (const { workspaceId, chartId, data } of updates) {
          newData[workspaceId] = { ...(newData[workspaceId] || {}), [chartId]: data };
        }
        return { gitVisData: newData };
      }),
    setGitVisLoading: (workspaceId, chartId, loading) =>
      set((s) => ({
        gitVisLoading: {
          ...s.gitVisLoading,
          [workspaceId]: { ...(s.gitVisLoading[workspaceId] || {}), [chartId]: loading },
        },
      })),
    setGitVisError: (workspaceId, chartId, error) =>
      set((s) => ({
        gitVisErrors: {
          ...s.gitVisErrors,
          [workspaceId]: { ...(s.gitVisErrors[workspaceId] || {}), [chartId]: error },
        },
      })),
    setGitVisTimeRange: (workspaceId, chartId, range) =>
      set((s) => {
        const next = {
          ...s.gitVisTimeRange,
          [workspaceId]: { ...(s.gitVisTimeRange[workspaceId] || {}), [chartId]: range },
        };
        persistTimeRange(next);
        return { gitVisTimeRange: next };
      }),
    clearWorkspaceGitVisData: (workspaceId) =>
      set((s) => {
        const { [workspaceId]: _, ...restData } = s.gitVisData;
        const { [workspaceId]: __, ...restLoading } = s.gitVisLoading;
        const { [workspaceId]: ___, ...restErrors } = s.gitVisErrors;
        const { [workspaceId]: ____, ...restTimeRange } = s.gitVisTimeRange;
        persistTimeRange(restTimeRange);
        return {
          gitVisData: restData,
          gitVisLoading: restLoading,
          gitVisErrors: restErrors,
          gitVisTimeRange: restTimeRange,
        };
      }),
    setGitVisLoadedPhases: (phases) => set({ gitVisLoadedPhases: phases }),
  };
};
