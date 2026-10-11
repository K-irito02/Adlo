import { describe, it, expect } from 'vitest';
import { createErrorToastSlice, type ErrorToastEntry } from '../errorToastSlice';
import type { StoreState } from '../../StoreState';

/** 用最小可变 state 驱动切片（只需 errorToasts 参与）。 */
function makeSlice() {
  let state = { errorToasts: [] as ErrorToastEntry[] } as unknown as StoreState;
  const set = (partial: Partial<StoreState> | ((s: StoreState) => Partial<StoreState>)) => {
    state = { ...state, ...(typeof partial === 'function' ? partial(state) : partial) };
  };
  const slice = createErrorToastSlice(set, () => state);
  return { slice, current: () => state.errorToasts };
}

describe('errorToastSlice 去重', () => {
  it('collapses repeated identical errors into a single toast (backend-down polling)', () => {
    const { slice, current } = makeSlice();

    const first = slice.reportError('NETWORK_ERROR', 'Network error: Failed to fetch', 'sysmon');
    const second = slice.reportError('NETWORK_ERROR', 'Network error: Failed to fetch', 'sysmon');
    const third = slice.reportError('NETWORK_ERROR', 'Network error: Failed to fetch', 'sysmon');

    expect(current()).toHaveLength(1);
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it('keeps genuinely different failures as separate toasts', () => {
    const { slice, current } = makeSlice();
    slice.reportError('NETWORK_ERROR', 'Network error: A', 'sysmon');
    slice.reportError('NETWORK_ERROR', 'Network error: B', 'sysmon');
    slice.reportError('NETWORK_ERROR', 'Network error: A', 'git');
    slice.reportError('NOT_FOUND', 'Network error: A', 'sysmon');
    expect(current()).toHaveLength(4);
  });

  it('separates silent diagnostics from visible toasts with the same payload', () => {
    const { slice, current } = makeSlice();
    slice.reportError('IO_ERROR', 'boom', 'boot');
    slice.reportSilentError('IO_ERROR', 'boom', 'boot');
    expect(current()).toHaveLength(2);
    expect(current().filter((t) => t.silent)).toHaveLength(1);
  });

  it('allows the same error again after it was dismissed', () => {
    const { slice, current } = makeSlice();
    const first = slice.reportError('NETWORK_ERROR', 'boom', 'sysmon');
    slice.dismissErrorToast(first);
    expect(current()).toHaveLength(0);
    slice.reportError('NETWORK_ERROR', 'boom', 'sysmon');
    expect(current()).toHaveLength(1);
  });

  it('still supports scoped clearing', () => {
    const { slice, current } = makeSlice();
    slice.reportError('NETWORK_ERROR', 'a', 'sysmon');
    slice.reportError('NETWORK_ERROR', 'b', 'git');
    slice.clearErrorToasts('sysmon');
    expect(current()).toHaveLength(1);
    expect(current()[0].scope).toBe('git');
  });
});
