/**
 * Toast 切片
 * 提供全局 toast 通知管理
 */
import type { StoreState } from '../StoreState';
import type { ToastType, ToastData } from '../../components/Toast';
import { createUiId } from '../shared';

export interface ToastSlice {
  toasts: ToastData[];
  showToast: (message: string, type?: ToastType, source?: string, duration?: number) => string;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

export const createToastSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): ToastSlice => ({
  toasts: [],
  showToast: (message, type = 'warning', source, duration) => {
    const id = createUiId('toast');
    const entry: ToastData = { id, message, type, source, duration };
    set((state) => ({ toasts: [...state.toasts, entry] }));
    return id;
  },
  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
  clearToasts: () => set({ toasts: [] }),
});
