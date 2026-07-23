import type { StoreState } from '../StoreState';

export interface TimeRangeState {
  preset: 'week' | 'month' | 'year' | 'all' | 'custom';
  since?: string;
  until?: string;
}

export function defaultTimeRange(): TimeRangeState {
  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(now.getFullYear() - 1);
  return {
    preset: 'year',
    since: oneYearAgo.toISOString().substring(0, 10),
    until: now.toISOString().substring(0, 10),
  };
}

export interface GitVisSlice {
  gitVisData: Record<string, Record<string, unknown>>;
  gitVisLoading: Record<string, Record<string, boolean>>;
  gitVisErrors: Record<string, Record<string, string | undefined>>;
  gitVisTimeRange: Record<string, Record<string, TimeRangeState>>;
  gitVisLoadedPhases: Record<string, 'high' | 'medium' | 'low' | undefined>;

  setGitVisData: (workspaceId: string, chartId: string, data: unknown) => void;
  setGitVisLoading: (workspaceId: string, chartId: string, loading: boolean) => void;
  setGitVisError: (workspaceId: string, chartId: string, error: string | undefined) => void;
  setGitVisTimeRange: (workspaceId: string, chartId: string, range: TimeRangeState) => void;
  clearWorkspaceGitVisData: (workspaceId: string) => void;
  setGitVisLoadedPhases: (phases: Record<string, 'high' | 'medium' | 'low' | undefined>) => void;
}

export const createGitVisSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): GitVisSlice => ({
  gitVisData: {},
  gitVisLoading: {},
  gitVisErrors: {},
  gitVisTimeRange: {},
  gitVisLoadedPhases: {},

  setGitVisData: (workspaceId, chartId, data) =>
    set((s) => ({
      gitVisData: {
        ...s.gitVisData,
        [workspaceId]: { ...(s.gitVisData[workspaceId] || {}), [chartId]: data },
      },
    })),
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
    set((s) => ({
      gitVisTimeRange: {
        ...s.gitVisTimeRange,
        [workspaceId]: { ...(s.gitVisTimeRange[workspaceId] || {}), [chartId]: range },
      },
    })),
  clearWorkspaceGitVisData: (workspaceId) =>
    set((s) => {
      const { [workspaceId]: _, ...restData } = s.gitVisData;
      const { [workspaceId]: __, ...restLoading } = s.gitVisLoading;
      const { [workspaceId]: ___, ...restErrors } = s.gitVisErrors;
      const { [workspaceId]: ____, ...restTimeRange } = s.gitVisTimeRange;
      return {
        gitVisData: restData,
        gitVisLoading: restLoading,
        gitVisErrors: restErrors,
        gitVisTimeRange: restTimeRange,
      };
    }),
  setGitVisLoadedPhases: (phases) => set({ gitVisLoadedPhases: phases }),
});
