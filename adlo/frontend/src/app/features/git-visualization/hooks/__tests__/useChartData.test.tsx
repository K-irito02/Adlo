import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useAppStore } from '@stores/slicedStore';
import { defaultTimeRange } from '@stores/slices/gitVisSlice';
import { useChartData } from '../useChartData';
import { CHART_IDS } from '../../chartIds';

function resetGitVisState(activeWorkspaceTab: string) {
  act(() => {
    useAppStore.setState((s) => ({
      ...s,
      activeWorkspaceTab,
      gitVisData: {},
      gitVisLoading: {},
      gitVisErrors: {},
      gitVisTimeRange: {},
      gitVisStale: {},
    }));
  });
}

afterEach(() => {
  cleanup();
});

describe('useChartData time range initialization', () => {
  it('initializes a default range for the workspace the active tab resolves to', () => {
    // The store starts on a tab that is not a real workspace (the default
    // 'workspace-1' or an id whose folder changed) and then the view's
    // auto-select switches to the workspace actually being displayed.
    resetGitVisState('workspace-1');

    const { result } = renderHook(() => useChartData(CHART_IDS.CODE_LINE_EVO));
    expect(result.current.timeRange).toBeDefined();

    act(() => {
      useAppStore.getState().setActiveWorkspaceTab('workspace_7114785d');
    });

    // The control only renders while the chart has a stored range, so the
    // default must be re-created for the newly active workspace.
    expect(result.current.timeRange).toEqual(defaultTimeRange());
  });

  it('initializes a default range again after switching between workspace tabs', () => {
    resetGitVisState('workspace_7114785d');

    const { result } = renderHook(() => useChartData(CHART_IDS.COMMIT_TIMELINE));
    const firstWorkspaceRange = result.current.timeRange;
    expect(firstWorkspaceRange).toEqual(defaultTimeRange());

    act(() => {
      useAppStore.getState().setActiveWorkspaceTab('workspace_8b3a686f');
    });
    expect(result.current.timeRange).toEqual(defaultTimeRange());

    act(() => {
      useAppStore.getState().setActiveWorkspaceTab('workspace_7114785d');
    });
    // Switching back keeps the stored range instead of replacing it with a new one.
    expect(result.current.timeRange).toBe(firstWorkspaceRange);
  });

  it('initializes again when a workspace re-appears after its ranges were cleared', () => {
    resetGitVisState('workspace_7114785d');

    const { result } = renderHook(() => useChartData(CHART_IDS.FILE_HOTSPOTS));
    expect(result.current.timeRange).toEqual(defaultTimeRange());

    // Removing the workspace prunes its git-vis slot; re-adding the same folder
    // reuses the same id, so the default range must be re-created.
    act(() => {
      useAppStore.getState().clearWorkspaceGitVisData('workspace_7114785d');
    });
    expect(result.current.timeRange).toEqual(defaultTimeRange());
  });
});
