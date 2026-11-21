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

export interface ErrorToastAction {
  label: string;
  /** 返回 true 表示处理成功，卡片可自动关闭。 */
  run: () => boolean | Promise<boolean>;
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
  /** 同一归一化错误的重复次数（首次为 1；命中去重时 +1，供卡片显"×N"） */
  count?: number;
  /** 同一归一化错误最近一次发生的时间（Date.now()，供"仍在发生"感知） */
  lastSeenAt?: number;
  /** 卡片底部动作按钮；有则渲染（如推送失败后的「重试推送」）。 */
  actions?: ErrorToastAction[];
  /** 可选的级别覆盖（缺省按 code/detail 推导）。 */
  level?: 'error' | 'warning' | 'info';
}

export interface ErrorToastOptions {
  actions?: ErrorToastAction[];
  /** 覆盖由 code 推导的级别（如推送失败即使 code=WORKSPACE_ERROR 也按 error 展示）。 */
  level?: 'error' | 'warning' | 'info';
}

export interface ErrorToastSlice {
  errorToasts: ErrorToastEntry[];
  reportError: (
    code: string,
    detail: string,
    scope?: string,
    options?: ErrorToastOptions,
  ) => string;
  /**
   * 静默上报：与 reportError 同队列同上限，但渲染层过滤（见 ErrorToastContainer），
   * 用户无感知；排查时可从 store 快照/errorToasts 中看到。
   */
  reportSilentError: (code: string, detail: string, scope?: string) => string;
  dismissErrorToast: (id: string) => void;
  /**
   * scope 提供时仅清除该作用域的错误；缺省清空全部。
   * `options.prefix` 为真时按作用域前缀清除（如 `git:push:` 清掉某工作区的全部推送失败卡）。
   */
  clearErrorToasts: (scope?: string, options?: { prefix?: boolean }) => void;
}

/**
 * 去重前的 detail 归一化（Phase 4 F6）：剥离每次变化的易变片段（时间戳/端口/
 * IPv4/attempt 计数/时长），使轮询/重连类错误的重复上报折叠为同一张卡。
 * 原始 detail 仍原样展示（首见版本），归一化键仅用于去重。
 *
 * 顺序依赖：时间戳规则必须先于端口规则 —— 否则 `00:52:40` 中的 `:52`/`:40`
 * 会先被端口规则吃掉（两侧同等坍缩，折叠效果虽等价，但 time 规则即失效）。
 *
 * 过拟合护栏（Closing M-3）：端口要求 host 侧含非数字字符 —— 纯 `数字:数字`
 * 计数器（行号 `line 10:20`、配比 `3:2`）原样保留；时长只收 `ms|sec(s)|second(s)`，
 * 裸 `3s`/`404s` 不碰（版本号与时长拼写相同，无法区分，宁漏勿错）。
 */
export function normalizeErrorDetail(detail: string): string {
  return (
    detail
      .replace(/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?\b/g, '#time#')
      .replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, '#ipv4#')
      // host 侧含 `#`（归一化中间产物如 `#ipv4#`）同样放行；纯数字 host 原样保留。
      .replace(/([A-Za-z0-9_.\-#[\]]+):(\d{1,5})\b/g, (m, host: string) =>
        /[^\d.]/.test(host) ? `${host}:#port#` : m,
      )
      .replace(/\b(attempt|retry|tried)\s*#?\d+/gi, '$1 #n#')
      // 时长只收 ms/sec(s)/second(s)：裸 `3s`/`404s` 与版本号拼写相同，宁漏勿错。
      .replace(/\b\d+\s?(ms|secs?|seconds?)\b/gi, '#dur#')
  );
}

/**
 * 去重键：`(silent, scope, code, 归一化 detail)` 相同的错误只保留一条。
 *
 * 动机：后端进程退出后，轮询/重连类调用会**反复**失败并各自 `captureError`，
 * 于是右下角不断堆出内容完全一致的卡片（用户实测：`Y` 中断后网络错误卡片刷屏）。
 * 同一错误只应提示一次；归一化后仍不同的 detail（真实不同的故障）各自成卡。
 *
 * scope 用三态区分（Phase 4 F8）：`undefined`（缺省）与 `''`（显式空串）是
 * 不同的键 —— 与 `clearErrorToasts` 的清除语义一致（`''` 只清显式空串条目）。
 */
function dedupeKey(
  code: string,
  detail: string,
  scope: string | undefined,
  silent: boolean,
): string {
  return JSON.stringify([silent, scope ?? null, code, normalizeErrorDetail(detail)]);
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
  reportError: (code, detail, scope, options) => {
    const duplicateId = findDuplicateId(get().errorToasts, code, detail, scope, false);
    if (duplicateId) {
      // 命中去重：不入队，但更新计数与最近发生时间（Phase 4 F7 —— 故障持续
      // 发生时用户能从"×N"感知"仍在发生"，而非一张静止旧卡）。
      // 同时移到队尾（Closing M-6）：持续刷新的旧卡不占坑，新 distinct 错误
      // 才能进入可见的最近 5 张；`lastSeenAt` 与数组顺序一致。
      const now = Date.now();
      set((state) => {
        const hit = state.errorToasts.find((entry) => entry.id === duplicateId);
        if (!hit) {
          return {};
        }
        return {
          errorToasts: keepVisibleFirst([
            ...state.errorToasts.filter((entry) => entry.id !== duplicateId),
            {
              ...hit,
              count: (hit.count ?? 1) + 1,
              lastSeenAt: now,
              ...(options?.actions ? { actions: options.actions } : {}),
              ...(options?.level ? { level: options.level } : {}),
            },
          ]),
        };
      });
      return duplicateId;
    }
    const id = createUiId('error-toast');
    const entry: ErrorToastEntry =
      scope !== undefined
        ? {
            id,
            code,
            detail,
            scope,
            count: 1,
            lastSeenAt: Date.now(),
            ...(options?.actions ? { actions: options.actions } : {}),
            ...(options?.level ? { level: options.level } : {}),
          }
        : {
            id,
            code,
            detail,
            count: 1,
            lastSeenAt: Date.now(),
            ...(options?.actions ? { actions: options.actions } : {}),
            ...(options?.level ? { level: options.level } : {}),
          };
    set((state) => ({
      errorToasts: keepVisibleFirst([...state.errorToasts, entry]),
    }));
    return id;
  },
  reportSilentError: (code, detail, scope) => {
    const duplicateId = findDuplicateId(get().errorToasts, code, detail, scope, true);
    if (duplicateId) {
      const now = Date.now();
      set((state) => {
        const hit = state.errorToasts.find((entry) => entry.id === duplicateId);
        if (!hit) {
          return {};
        }
        return {
          errorToasts: keepVisibleFirst([
            ...state.errorToasts.filter((entry) => entry.id !== duplicateId),
            { ...hit, count: (hit.count ?? 1) + 1, lastSeenAt: now },
          ]),
        };
      });
      return duplicateId;
    }
    const id = createUiId('error-toast');
    // 与 reportError 同形：scope 缺省时省略该键（Closing L-6 统一）。
    const entry: ErrorToastEntry =
      scope !== undefined
        ? { id, code, detail, scope, silent: true, count: 1, lastSeenAt: Date.now() }
        : { id, code, detail, silent: true, count: 1, lastSeenAt: Date.now() };
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
  clearErrorToasts: (scope, options) =>
    set((state) => {
      const next =
        scope === undefined
          ? []
          : state.errorToasts.filter((t) =>
              options?.prefix ? !(t.scope ?? '').startsWith(scope) : t.scope !== scope,
            );
      return next.length === state.errorToasts.length ? {} : { errorToasts: next };
    }),
});
