import { describe, expect, it } from 'vitest';
import { createStore } from 'zustand';
import { createToastSlice, type ToastSlice } from '../toastSlice';

function makeToastStore() {
  return createStore<ToastSlice>(
    (set, get) => createToastSlice(set as never, get as never) as ToastSlice,
  );
}

describe('toastSlice.showLoadingToast', () => {
  it('creates a long-lived shimmer toast and can remove it by id', () => {
    const store = makeToastStore();
    const id = store.getState().showLoadingToast('正在自动恢复…', 'warning', 'dsh');
    expect(store.getState().toasts).toEqual([
      expect.objectContaining({
        id,
        message: '正在自动恢复…',
        type: 'warning',
        source: 'dsh',
        duration: 0,
        shimmer: true,
      }),
    ]);
    store.getState().removeToast(id);
    expect(store.getState().toasts).toHaveLength(0);
  });

  it('replaces any previous toast (single-toast channel)', () => {
    const store = makeToastStore();
    store.getState().showToast('old');
    store.getState().showLoadingToast('new');
    expect(store.getState().toasts).toHaveLength(1);
    expect(store.getState().toasts[0].message).toBe('new');
  });
});
