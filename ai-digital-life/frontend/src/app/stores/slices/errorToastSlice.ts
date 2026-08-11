/**
 * 报错 Toast 切片
 * 提供不自动消失的报错 toast 队列（右下角持久渲染），与顶部临时 toast 分离。
 */
import type { StoreState } from '../StoreState';
import { createUiId } from '../shared';

export interface ErrorToastEntry {
  id: string;
  code: string;
  detail: string;
}

export interface ErrorToastSlice {
  errorToasts: ErrorToastEntry[];
  reportError: (code: string, detail: string) => string;
  dismissErrorToast: (id: string) => void;
  clearErrorToasts: () => void;
}

export const createErrorToastSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): ErrorToastSlice => ({
  errorToasts: [],
  reportError: (code, detail) => {
    const id = createUiId('error-toast');
    const entry: ErrorToastEntry = { id, code, detail };
    set((state) => {
      const next = [...state.errorToasts, entry];
      console.log('[ADL-DEBUG][error-toast] reportError', { id, code, detail, total: next.length });
      return { errorToasts: next };
    });
    return id;
  },
  dismissErrorToast: (id) => {
    set((state) => {
      const next = state.errorToasts.filter((t) => t.id !== id);
      console.log('[ADL-DEBUG][error-toast] dismissErrorToast', { id, remaining: next.length });
      return { errorToasts: next };
    });
  },
  clearErrorToasts: () =>
    set((state) => {
      console.log('[ADL-DEBUG][error-toast] clearErrorToasts', {
        cleared: state.errorToasts.length,
      });
      return { errorToasts: [] };
    }),
});
