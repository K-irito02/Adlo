import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../slicedStore';

describe('toastSlice', () => {
  beforeEach(() => {
    useAppStore.setState({ toasts: [] });
  });

  it('showToast adds a toast and returns its id', () => {
    const id = useAppStore.getState().showToast('hello', 'success', 'test-source');
    expect(id).toMatch(/^toast-/);
    const toasts = useAppStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({
      message: 'hello',
      type: 'success',
      source: 'test-source',
    });
    expect(toasts[0].id).toBe(id);
  });

  it('showToast defaults type to warning when omitted', () => {
    useAppStore.getState().showToast('warn message');
    const toasts = useAppStore.getState().toasts;
    expect(toasts[0].type).toBe('warning');
  });

  it('showToast replaces existing toasts (no overlap)', () => {
    useAppStore.getState().showToast('first');
    useAppStore.getState().showToast('second');
    const toasts = useAppStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toBe('second');
  });

  it('removeToast removes the toast with matching id', () => {
    const id1 = useAppStore.getState().showToast('one');
    useAppStore.getState().removeToast(id1);
    const toasts = useAppStore.getState().toasts;
    expect(toasts).toHaveLength(0);
  });

  it('removeToast is a no-op when id does not match', () => {
    useAppStore.getState().showToast('one');
    useAppStore.getState().removeToast('nonexistent-id');
    expect(useAppStore.getState().toasts).toHaveLength(1);
  });

  it('clearToasts empties the toasts array', () => {
    useAppStore.getState().showToast('a');
    useAppStore.getState().showToast('b');
    useAppStore.getState().showToast('c');
    useAppStore.getState().clearToasts();
    expect(useAppStore.getState().toasts).toEqual([]);
  });
});
