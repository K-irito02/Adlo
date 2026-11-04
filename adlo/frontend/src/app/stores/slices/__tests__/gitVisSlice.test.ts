import { describe, it, expect, afterEach, vi } from 'vitest';
import { defaultTimeRange, createGitVisSlice } from '../gitVisSlice';
import type { GitVisSlice } from '../gitVisSlice';
import type { StoreState } from '../../StoreState';

afterEach(() => {
  vi.useRealTimers();
});

describe('defaultTimeRange', () => {
  it('defaults to the current calendar year expressed as a custom range', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T10:00:00'));
    expect(defaultTimeRange()).toEqual({
      preset: 'custom',
      since: '2026-01-01',
      until: '2026-12-31',
    });
  });
});

function createSliceHarness() {
  let state = {
    // Seed the slots the slice's writers spread over — the real store is built
    // from createGitVisSlice's initial values, so this mirrors that shape.
    gitVisData: {},
    gitVisLoading: {},
    gitVisErrors: {},
    gitVisTimeRange: {},
    gitVisStale: {},
    gitVisLoadedPhases: {},
  } as unknown as StoreState;
  const set = (partial: Partial<StoreState> | ((s: StoreState) => Partial<StoreState>)) => {
    state = { ...state, ...(typeof partial === 'function' ? partial(state) : partial) };
  };
  const slice: GitVisSlice = createGitVisSlice(set, () => state);
  return { slice, getState: () => state };
}

describe('gitVisStale lifecycle', () => {
  it('marks only the given workspace stale', () => {
    const { slice, getState } = createSliceHarness();
    slice.setGitVisStale('ws-1', true);
    expect(getState().gitVisStale).toEqual({ 'ws-1': true });
  });

  it('removes the key when clearing staleness instead of leaving a false placeholder', () => {
    const { slice, getState } = createSliceHarness();
    slice.setGitVisStale('ws-1', true);
    slice.setGitVisStale('ws-1', false);
    expect(getState().gitVisStale).toEqual({});
    expect('ws-1' in getState().gitVisStale).toBe(false);
  });

  it('does not touch other workspaces when clearing one', () => {
    const { slice, getState } = createSliceHarness();
    slice.setGitVisStale('ws-1', true);
    slice.setGitVisStale('ws-2', true);
    slice.setGitVisStale('ws-1', false);
    expect(getState().gitVisStale).toEqual({ 'ws-2': true });
  });

  it('clearWorkspaceGitVisData prunes the stale mark along with the rest of the slot', () => {
    const { slice, getState } = createSliceHarness();
    slice.setGitVisStale('ws-1', true);
    slice.setGitVisStale('ws-2', true);
    slice.setGitVisData('ws-1', 'heatmap', {});
    slice.clearWorkspaceGitVisData('ws-1');
    expect(getState().gitVisStale).toEqual({ 'ws-2': true });
    expect(getState().gitVisData['ws-1']).toBeUndefined();
  });
});
