/**
 * 报错 Toast 切片
 * 提供不自动消失的报错 toast 队列（右下角持久渲染），与顶部临时 toast 分离。
 */
import type { StoreState } from '../StoreState';
import { createUiId } from '../shared';

/** store 级错误 toast 队列上限（UI 仅显示最近 5 条，这里保留更多供关闭后补位） */
export const ERROR_TOAST_STORE_LIMIT = 50;

export interface ErrorToastEntry {
  id: string;
  code: string;
  detail: string;
  /** 产生该错误的 action 模块作用域（可选；空串是合法 scope 值，与缺省 undefined 区分） */
  scope?: string;
  /**
   * 静默记录（Phase 4 审查 S3）：只进诊断队列供排查，不在右下角渲染。
   * 用于启动级联等"打扰比信息价值更大"的场景；真实故障仍可观测。
   */
  silent?: boolean;
}

export interface ErrorToastSlice {
  errorToasts: ErrorToastEntry[];
  reportError: (code: string, detail: string, scope?: string) => string;
  /**
   * 静默上报：与 reportError 同队列同上限，但渲染层过滤（见 ErrorToastContainer），
   * 用户无感知；排查时可从 store 快照/errorToasts 中看到。
   */
  reportSilentError: (code: string, detail: string, scope?: string) => string;
  dismissErrorToast: (id: string) => void;
  /** scope 提供时仅清除该作用域的错误；缺省清空全部 */
  clearErrorToasts: (scope?: string) => void;
}

export const createErrorToastSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): ErrorToastSlice => ({
  errorToasts: [],
  reportError: (code, detail, scope) => {
    const id = createUiId('error-toast');
    const entry: ErrorToastEntry =
      scope !== undefined ? { id, code, detail, scope } : { id, code, detail };
    set((state) => {
      const next = [...state.errorToasts, entry];
      return { errorToasts: next.slice(-ERROR_TOAST_STORE_LIMIT) };
    });
    return id;
  },
  reportSilentError: (code, detail, scope) => {
    const id = createUiId('error-toast');
    const entry: ErrorToastEntry = { id, code, detail, scope, silent: true };
    set((state) => {
      const next = [...state.errorToasts, entry];
      return { errorToasts: next.slice(-ERROR_TOAST_STORE_LIMIT) };
    });
    return id;
  },
  dismissErrorToast: (id) => {
    set((state) => ({
      errorToasts: state.errorToasts.filter((t) => t.id !== id),
    }));
  },
  clearErrorToasts: (scope) =>
    set((state) => {
      const next = scope !== undefined ? state.errorToasts.filter((t) => t.scope !== scope) : [];
      return next.length === state.errorToasts.length ? {} : { errorToasts: next };
    }),
});
