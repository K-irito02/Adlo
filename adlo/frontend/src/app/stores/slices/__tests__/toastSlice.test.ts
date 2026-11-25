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

  it('普通 toast 不替换正在显示的加载 toast', () => {
    const store = makeToastStore();
    const loadingId = store.getState().showLoadingToast('正在自动恢复…', 'warning', 'dsh');
    store.getState().showToast('操作进行中');
    const toasts = store.getState().toasts;
    expect(toasts.map((toast) => toast.message)).toEqual(['正在自动恢复…', '操作进行中']);
    expect(toasts[0].id).toBe(loadingId);
  });

  it('再次显示加载 toast 时替换旧的加载 toast，保留普通 toast', () => {
    const store = makeToastStore();
    store.getState().showToast('old');
    store.getState().showLoadingToast('first');
    store.getState().showLoadingToast('second');
    const toasts = store.getState().toasts;
    expect(toasts.map((toast) => toast.message)).toEqual(['old', 'second']);
  });
});
