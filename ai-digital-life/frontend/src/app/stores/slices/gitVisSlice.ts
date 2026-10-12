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
  // Use a 'custom' calendar-year range instead of the 'year' preset: the
  // 'year' preset means a rolling "past 12 months" which is re-resolved against
  // today on every refresh, whereas the default here is the fixed current
  // calendar year (e.g. for the calendar heatmap).
  return {
    preset: 'custom',
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
  /**
   * Workspaces whose cached chart data is known to be out of date (a commit
   * HEAD or branch changed). While set, the workspace's auto-refresh guard
   * re-fetches even though a full cache is present, so the stale data keeps
   * rendering until fresh data lands instead of flashing empty.
   */
  gitVisStale: Record<string, boolean>;

  setGitVisData: (workspaceId: string, chartId: string, data: unknown) => void;
  setGitVisDataBatch: (updates: { workspaceId: string; chartId: string; data: unknown }[]) => void;
  setGitVisLoading: (workspaceId: string, chartId: string, loading: boolean) => void;
  setGitVisError: (workspaceId: string, chartId: string, error: string | undefined) => void;
  setGitVisTimeRange: (workspaceId: string, chartId: string, range: TimeRangeState) => void;
  markGitVisStale: (workspaceId: string, stale: boolean) => void;
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
    gitVisStale: {},

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
    markGitVisStale: (workspaceId, stale) =>
      set((s) => ({ gitVisStale: { ...s.gitVisStale, [workspaceId]: stale } })),
    clearWorkspaceGitVisData: (workspaceId) =>
      set((s) => {
        const { [workspaceId]: _, ...restData } = s.gitVisData;
        const { [workspaceId]: __, ...restLoading } = s.gitVisLoading;
        const { [workspaceId]: ___, ...restErrors } = s.gitVisErrors;
        const { [workspaceId]: ____, ...restTimeRange } = s.gitVisTimeRange;
        const { [workspaceId]: _____, ...restStale } = s.gitVisStale;
        persistTimeRange(restTimeRange);
        return {
          gitVisData: restData,
          gitVisLoading: restLoading,
          gitVisErrors: restErrors,
          gitVisTimeRange: restTimeRange,
          gitVisStale: restStale,
        };
      }),
    setGitVisLoadedPhases: (phases) => set({ gitVisLoadedPhases: phases }),
  };
};
