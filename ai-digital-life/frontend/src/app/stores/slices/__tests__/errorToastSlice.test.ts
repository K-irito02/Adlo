import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../../slicedStore';

describe('errorToastSlice', () => {
  beforeEach(() => {
    useAppStore.setState({ errorToasts: [] });
  });

  it('reportError adds an entry and returns its id', () => {
    const id = useAppStore.getState().reportError(
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
});
