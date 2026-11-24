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
  /**
   * 加载型 toast（文字扫光、常驻）。用于 DSH 启动/恢复这类可能持续数十秒的操作；
   * 调用方在目标标签页打开（或流程失败/取消）后 `removeToast(id)` 收起。
   */
  showLoadingToast: (message: string, type?: ToastType, source?: string) => string;
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
    set(() => ({ toasts: [entry] }));
    return id;
  },
  showLoadingToast: (message, type = 'warning', source) => {
    const id = createUiId('toast');
    const entry: ToastData = { id, message, type, source, duration: 0, shimmer: true };
    set(() => ({ toasts: [entry] }));
    return id;
  },
  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
  clearToasts: () => set({ toasts: [] }),
});
