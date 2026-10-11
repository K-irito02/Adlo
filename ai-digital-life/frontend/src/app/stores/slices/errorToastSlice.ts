/**
 * 报错 Toast 切片
 * 提供不自动消失的报错 toast 队列（右下角持久渲染），与顶部临时 toast 分离。
 */
import type { StoreState } from '../StoreState';
import { createUiId } from '../shared';

/** store 级错误 toast 队列上限（UI 仅显示最近 5 条，这里保留更多供关闭后补位） */
export const ERROR_TOAST_STORE_LIMIT = 50;

/** 静默诊断保留上限（收尾 F-12）：静默条目不挤占可见提示的配额，单独截断。 */
export const SILENT_DIAGNOSTIC_LIMIT = 10;

/**
 * 队列裁剪：可见提示优先占满配额，静默诊断单独截断（收尾 F-12）。
 * 高频 silent 场景不再挤掉用户可见的错误提示。
 */
function keepVisibleFirst(entries: ErrorToastEntry[]): ErrorToastEntry[] {
  const visible = entries.filter((entry) => !entry.silent);
  const silent = entries.filter((entry) => entry.silent);
  return [...visible.slice(-ERROR_TOAST_STORE_LIMIT), ...silent.slice(-SILENT_DIAGNOSTIC_LIMIT)];
}

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

/**
 * 去重键：`(silent, scope, code, detail)` 完全相同的错误只保留一条。
 *
 * 动机：后端进程退出后，轮询/重连类调用会**反复**失败并各自 `captureError`，
 * 于是右下角不断堆出内容完全一致的卡片（用户实测：`Y` 中断后网络错误卡片刷屏）。
 * 同一错误只应提示一次；不同 detail（真实不同的故障）仍各自成卡。
 */
function dedupeKey(
  code: string,
  detail: string,
  scope: string | undefined,
  silent: boolean,
): string {
  return `${silent ? 'S' : 'V'}\u0000${scope ?? ''}\u0000${code}\u0000${detail}`;
}

/** 已存在同键条目时返回其 id（不再入队），否则返回 null。 */
function findDuplicateId(
  entries: ErrorToastEntry[],
  code: string,
  detail: string,
  scope: string | undefined,
  silent: boolean,
): string | null {
  const key = dedupeKey(code, detail, scope, silent);
  return (
    entries.find(
      (entry) => dedupeKey(entry.code, entry.detail, entry.scope, !!entry.silent) === key,
    )?.id ?? null
  );
}

export const createErrorToastSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  get: () => StoreState,
): ErrorToastSlice => ({
  errorToasts: [],
  reportError: (code, detail, scope) => {
    const duplicateId = findDuplicateId(get().errorToasts, code, detail, scope, false);
    if (duplicateId) {
      return duplicateId;
    }
    const id = createUiId('error-toast');
    const entry: ErrorToastEntry =
      scope !== undefined ? { id, code, detail, scope } : { id, code, detail };
    set((state) => ({
      errorToasts: keepVisibleFirst([...state.errorToasts, entry]),
    }));
    return id;
  },
  reportSilentError: (code, detail, scope) => {
    const duplicateId = findDuplicateId(get().errorToasts, code, detail, scope, true);
    if (duplicateId) {
      return duplicateId;
    }
    const id = createUiId('error-toast');
    const entry: ErrorToastEntry = { id, code, detail, scope, silent: true };
    set((state) => ({
      errorToasts: keepVisibleFirst([...state.errorToasts, entry]),
    }));
    return id;
  },
  dismissErrorToast: (id) => {
    set((state) => ({
      errorToasts: state.errorToasts.filter((t) => t.id !== id),
    }));
  },
  // 注意：无 scope 的全清同样清除静默诊断（显式用户动作，排查链以本次动作为界）。
  clearErrorToasts: (scope) =>
    set((state) => {
      const next = scope !== undefined ? state.errorToasts.filter((t) => t.scope !== scope) : [];
      return next.length === state.errorToasts.length ? {} : { errorToasts: next };
    }),
});
