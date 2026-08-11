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
    set((state) => ({ errorToasts: [...state.errorToasts, entry] }));
    return id;
  },
  dismissErrorToast: (id) => {
    set((state) => ({ errorToasts: state.errorToasts.filter((t) => t.id !== id) }));
  },
  clearErrorToasts: () => set({ errorToasts: [] }),
});
