import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../../slicedStore';

describe('errorToastSlice', () => {
  beforeEach(() => {
    useAppStore.setState({ errorToasts: [] });
  });

  it('reportError adds an entry and returns its id', () => {
    const id = useAppStore
      .getState()
      .reportError(
        'WORKSPACE_ERROR',
        'fatal: not a git repository (or any of the parent directories): .git',
      );
    expect(id).toMatch(/^error-toast-/);
    const toasts = useAppStore.getState().errorToasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({
      id,
      code: 'WORKSPACE_ERROR',
      detail: 'fatal: not a git repository (or any of the parent directories): .git',
    });
  });

  it('reportError appends without removing existing entries', () => {
    const s = useAppStore.getState();
    s.reportError('NOT_FOUND', 'one');
    s.reportError('STORAGE_ERROR', 'two');
    expect(useAppStore.getState().errorToasts).toHaveLength(2);
  });

  it('dismissErrorToast removes only the matching entry', () => {
    const s = useAppStore.getState();
    const id1 = s.reportError('NOT_FOUND', 'one');
    s.reportError('STORAGE_ERROR', 'two');
    s.dismissErrorToast(id1);
    const toasts = useAppStore.getState().errorToasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].id).not.toBe(id1);
  });

  it('clearErrorToasts empties the list', () => {
    const s = useAppStore.getState();
    s.reportError('NOT_FOUND', 'one');
    s.reportError('STORAGE_ERROR', 'two');
    s.clearErrorToasts();
    expect(useAppStore.getState().errorToasts).toEqual([]);
  });

  it('caps the queue at the store limit, dropping the oldest entries', () => {
    const s = useAppStore.getState();
    for (let i = 0; i < 55; i += 1) {
      s.reportError('NOT_FOUND', `detail ${i}`);
    }
    const toasts = useAppStore.getState().errorToasts;
    expect(toasts.length).toBe(50);
    expect(toasts[toasts.length - 1].detail).toBe('detail 54');
    expect(toasts[0].detail).toBe('detail 5');
  });

  it('stores the scope on reported entries', () => {
    const s = useAppStore.getState();
    s.reportError('NOT_FOUND', 'one', 'gitBranchActions');
    const toasts = useAppStore.getState().errorToasts;
    expect(toasts[0].scope).toBe('gitBranchActions');
  });

  it('stores an empty-string scope and clears it on demand', () => {
    const s = useAppStore.getState();
    s.reportError('NOT_FOUND', 'one', '');
    expect(useAppStore.getState().errorToasts[0].scope).toBe('');
    useAppStore.getState().clearErrorToasts('');
    expect(useAppStore.getState().errorToasts).toEqual([]);
  });

  it('reportSilentError stores a silent entry in the same bounded queue', () => {
    const s = useAppStore.getState();
    s.reportSilentError('IO_ERROR', 'disk gone', 'git');
    const toasts = useAppStore.getState().errorToasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].silent).toBe(true);
    expect(toasts[0].detail).toBe('disk gone');
  });

  it('clearErrorToasts with empty string clears only empty-scope entries', () => {
    const s = useAppStore.getState();
    s.reportError('NOT_FOUND', 'empty-scope err', '');
    s.reportError('NOT_FOUND', 'scoped err', 'gitBranchActions');
    s.reportError('NOT_FOUND', 'unscoped err');
    useAppStore.getState().clearErrorToasts('');
    expect(useAppStore.getState().errorToasts.map((t) => t.detail)).toEqual([
      'scoped err',
      'unscoped err',
    ]);
  });

  it('clearErrorToasts with a scope removes only matching-scope entries', () => {
    const s = useAppStore.getState();
    s.reportError('NOT_FOUND', 'git err', 'gitBranchActions');
    s.reportError('NOT_FOUND', 'provider err', 'providerActions');
    s.reportError('NOT_FOUND', 'unscoped err');
    useAppStore.getState().clearErrorToasts('gitBranchActions');
    const toasts = useAppStore.getState().errorToasts;
    expect(toasts.map((t) => t.detail)).toEqual(['provider err', 'unscoped err']);
  });

  it('clearErrorToasts without a scope clears everything', () => {
    const s = useAppStore.getState();
    s.reportError('NOT_FOUND', 'one', 'gitBranchActions');
    s.reportError('NOT_FOUND', 'two', 'providerActions');
    useAppStore.getState().clearErrorToasts();
    expect(useAppStore.getState().errorToasts).toEqual([]);
  });
});
