import type { StoreApi } from 'zustand';
import type { StoreState } from '../StoreState';
import type { EnvSourceMode } from '../../../shared/ipc/env';
import { captureError, clearError } from '../shared';
// Store 侧提示文案取静态语言包（与 gitBranchActions 同模式，不走 hook）：
// 非安装变异失败走通用 `common.operationFailed`，安装相关走 `environment.*`
// 域文案（`environmentInstallSuccess/Failed`，带 {dep}/{version} 插值）。
import { commonZh } from '../../i18n/zh-CN/common';
import { commonEn } from '../../i18n/en-US/common';
import { environmentZh } from '../../i18n/zh-CN/environment';
import { environmentEn } from '../../i18n/en-US/environment';
import { resolveAppLanguage } from '../../i18n/resolveLanguage';

const SCOPE = 'env';

/**
 * 安装任务轮询间隔（3s）。全量 getStatus 开销大
 * （每轮含 registry/where/netprobe 探测，约 1-2s），禁止常驻轮询：
 * 仅 install 成功后 task 非空时启动，task 变 null 即停（见 pollEnvTaskWhileRunning）。
 */
export const ENV_POLL_INTERVAL_MS = 3000;

/** 持续失败熔断：连续失败达此次数（约 30s）即停轮询、复位 busy、单次 toast。 */
export const ENV_POLL_MAX_CONSECUTIVE_FAILURES = 10;

/** 轮询总时长上限：超时即停（防 task 常驻非空 + 后端可达时的无限轮询）。 */
export const ENV_POLL_MAX_ELAPSED_MS = 10 * 60 * 1000;

/** 轮询定时器（模块级）：install 重入先清旧轮询，避免双 interval 并跑。 */
let envPollTimer: number | null = null;
/** 当前轮询实例的取消器：新轮询启动时先停旧实例（含在途 tick），避免旧写覆盖新状态。 */
let cancelActiveEnvPoll: (() => void) | null = null;

function envDict(get: () => StoreState) {
  const locale = resolveAppLanguage(get().appInfo?.config?.language);
  return {
    failure: (locale === 'en-US' ? commonEn : commonZh).operationFailed,
    installSuccess: (locale === 'en-US' ? environmentEn : environmentZh).environmentInstallSuccess,
    installFailed: (locale === 'en-US' ? environmentEn : environmentZh).environmentInstallFailed,
    uninstallFailed: (locale === 'en-US' ? environmentEn : environmentZh)
      .environmentUninstallFailed,
  };
}

function fill(template: string, vars: Record<string, string | number>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{${key}}`, String(value));
  }
  return out;
}

/**
 * 从任务 kind（`env-{dep}-{install|uninstall}`，见 shared/ipc/env.ts
 * EnvTaskKind）反解依赖名，供安装 toast 的 {dep} 插值。
 */
function depOfTaskKind(kind: string): string {
  return kind.replace(/^env-/, '').replace(/-(install|uninstall)$/, '');
}

/**
 * 后端安装任务 label 已含 `<dep> <version>`（handlers/env.rs），而 task.version
 * 原样携带该 label；toast 再插值 dep 会渲染成 "node node 24.22.1"。
 * 仅剥离开头的 `<dep> `，卸载任务（label=version）原样保留。
 */
function taskVersionOf(task: { version: string }, dep: string): string {
  return dep !== '' ? task.version.replace(new RegExp('^' + dep + '\\s+'), '') : task.version;
}

/** 变异成功后的状态刷新：best-effort 静默，不记录错误卡片（主操作已成功）。 */
async function refreshEnvStatusSilently(get: () => StoreState): Promise<void> {
  let result: Awaited<ReturnType<typeof window.digitalLife.env.getStatus>>;
  try {
    result = await window.digitalLife.env.getStatus();
  } catch {
    return;
  }
  if (result.ok) {
    get().setEnvStatus(result.data);
  }
}

function clearEnvPollTimer(): void {
  if (envPollTimer !== null) {
    window.clearInterval(envPollTimer);
    envPollTimer = null;
  }
}

export function createEnvActions(set: StoreApi<StoreState>['setState'], get: () => StoreState) {
  return {
    /**
     * [fetchEnvStatus - 拉取环境依赖全量状态]
     * @returns true=成功；false=失败（非 silent 时已记录全局错误卡片）
     * @param silent 后台同步传 true：不碰错误卡片（既不记新的，也不清旧卡）
     * @writes envSlice.envStatus/envBusy（silent 不碰 envBusy，避免后台刷新闪 spinner）
     * @see httpBridge.ts → env.getStatus (/env/status)
     */
    fetchEnvStatus: async (silent = false): Promise<boolean> => {
      if (!silent) {
        clearError(get, SCOPE);
        get().setEnvBusy(true);
      }
      let result: Awaited<ReturnType<typeof window.digitalLife.env.getStatus>>;
      try {
        result = await window.digitalLife.env.getStatus();
      } catch (e) {
        if (!silent) {
          captureError(get, e, SCOPE);
          get().setEnvBusy(false);
        }
        return false;
      }
      if (result.ok) {
        get().setEnvStatus(result.data);
        if (!silent) {
          // 后端仍在执行（task 非空且无 error）时保持 busy，避免主操作刚刷新完
          // 就被非静默 fetch 提前解锁；终态/失败才复位。
          const task = result.data.task;
          get().setEnvBusy(task !== null && (task.error ?? '') === '');
        }
        return true;
      }
      if (!silent) {
        captureError(get, result.error, SCOPE);
        get().setEnvBusy(false);
      }
      return false;
    },

    /**
     * [selectEnvSource - 切换指定依赖的来源模式并静默刷新]
     * @returns true=成功；false=失败（已记录全局错误卡片 + toast，旧状态保留）
     * @writes envSlice.envStatus/envBusy
     * @see httpBridge.ts → env.selectSource (/env/select-source)
     */
    selectEnvSource: async (dep: string, mode: EnvSourceMode): Promise<boolean> => {
      clearError(get, SCOPE);
      get().setEnvBusy(true);
      let result: Awaited<ReturnType<typeof window.digitalLife.env.selectSource>>;
      try {
        result = await window.digitalLife.env.selectSource(dep, mode);
      } catch (e) {
        captureError(get, e, SCOPE);
        get().showToast(envDict(get).failure, 'error');
        get().setEnvBusy(false);
        return false;
      }
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        get().showToast(envDict(get).failure, 'error');
        get().setEnvBusy(false);
        return false;
      }
      await refreshEnvStatusSilently(get);
      get().setEnvBusy(false);
      return true;
    },

    /**
     * [installEnvDep - 安装指定依赖（可选版本），成功后启动任务轮询]
     * @returns true=安装请求已接受（轮询另行跟进终态）；false=失败（toast + 错误卡，旧状态保留）
     * @writes envSlice.envStatus/envBusy（busy 保持到轮询结束或失败即复位）
     * @see httpBridge.ts → env.install (/env/install)
     */
    installEnvDep: async (dep: string, version?: string): Promise<boolean> => {
      clearError(get, SCOPE);
      get().setEnvBusy(true);
      let result: Awaited<ReturnType<typeof window.digitalLife.env.install>>;
      try {
        result = await window.digitalLife.env.install(dep, version);
      } catch (e) {
        captureError(get, e, SCOPE);
        get().showToast(fill(envDict(get).installFailed, { dep }), 'error');
        get().setEnvBusy(false);
        return false;
      }
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        get().showToast(fill(envDict(get).installFailed, { dep }), 'error');
        get().setEnvBusy(false);
        return false;
      }
      // 静默刷新是 best-effort（内部吞错，不影响控制流）：无论成功与否都启动轮询，
      // 已接受的任务不会因刷新失败而无人跟进。
      await refreshEnvStatusSilently(get);
      get().pollEnvTaskWhileRunning();
      return true;
    },

    /**
     * [uninstallEnvDep - 卸载指定宿主依赖（可选版本），成功后启动任务轮询]
     * @returns true=卸载请求已接受（轮询另行跟进终态）；false=失败（toast + 错误卡，旧状态保留）
     * @writes envSlice.envStatus/envBusy（busy 保持到轮询结束或失败即复位）
     * @see httpBridge.ts → env.uninstall (/env/uninstall)
     */
    uninstallEnvDep: async (dep: string, version?: string): Promise<boolean> => {
      clearError(get, SCOPE);
      get().setEnvBusy(true);
      let result: Awaited<ReturnType<typeof window.digitalLife.env.uninstall>>;
      try {
        result = await window.digitalLife.env.uninstall(dep, version);
      } catch (e) {
        captureError(get, e, SCOPE);
        get().showToast(fill(envDict(get).uninstallFailed, { dep }), 'error');
        get().setEnvBusy(false);
        return false;
      }
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        get().showToast(fill(envDict(get).uninstallFailed, { dep }), 'error');
        get().setEnvBusy(false);
        return false;
      }
      // 静默刷新是 best-effort（内部吞错，不影响控制流）：无论成功与否都启动轮询，
      // 已接受的任务不会因刷新失败而无人跟进。
      await refreshEnvStatusSilently(get);
      get().pollEnvTaskWhileRunning();
      return true;
    },

    /**
     * [setEnvCustomPath - 设置指定依赖的自定义路径并静默刷新]
     * @returns true=成功；false=失败（已记录全局错误卡片 + toast，旧状态保留）
     * @writes envSlice.envStatus/envBusy
     * @see httpBridge.ts → env.setCustomPath (/env/set-custom-path)
     */
    setEnvCustomPath: async (dep: string, path: string): Promise<boolean> => {
      clearError(get, SCOPE);
      get().setEnvBusy(true);
      let result: Awaited<ReturnType<typeof window.digitalLife.env.setCustomPath>>;
      try {
        result = await window.digitalLife.env.setCustomPath(dep, path);
      } catch (e) {
        captureError(get, e, SCOPE);
        get().showToast(envDict(get).failure, 'error');
        get().setEnvBusy(false);
        return false;
      }
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        get().showToast(envDict(get).failure, 'error');
        get().setEnvBusy(false);
        return false;
      }
      await refreshEnvStatusSilently(get);
      get().setEnvBusy(false);
      return true;
    },

    /**
     * [recheckEnv - 重检依赖（可选单 dep，不传即全量）并静默刷新]
     * @returns true=成功；false=失败（已记录全局错误卡片 + toast，旧状态保留）
     * @writes envSlice.envStatus/envBusy
     * @see httpBridge.ts → env.recheck (/env/recheck)
     */
    recheckEnv: async (dep?: string): Promise<boolean> => {
      clearError(get, SCOPE);
      get().setEnvBusy(true);
      let result: Awaited<ReturnType<typeof window.digitalLife.env.recheck>>;
      try {
        result = await window.digitalLife.env.recheck(dep);
      } catch (e) {
        captureError(get, e, SCOPE);
        get().showToast(envDict(get).failure, 'error');
        get().setEnvBusy(false);
        return false;
      }
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        get().showToast(envDict(get).failure, 'error');
        get().setEnvBusy(false);
        return false;
      }
      await refreshEnvStatusSilently(get);
      get().setEnvBusy(false);
      return true;
    },

    /**
     * [pollEnvTaskWhileRunning - 任务进行中才轮询全量状态]
     *
     * 启动时不强制要求 `envStatus` 已加载：状态为 null 时照常起 3s 轮询，由首个
     * tick 取回状态并采用其中的任务；若首轮即 `task: null` 则静默收尾（非本次操作）。
     * 某次 tick 拿到 `task: null` 即停轮询 + 成功 toast（仅安装类任务）+ 复位 busy。
     * `task.error` 非空视为终态失败：停轮询、清本地 task、复位 busy、toast 域错误。
     * 启动时捕获的 task 已带 error 属陈旧快照：只清本地 task + 复位 busy，不重放提示。
     * tick fail-open：桥抛错 / !ok 静默跳过（下一轮自愈），持续失败达
     * `ENV_POLL_MAX_CONSECUTIVE_FAILURES` 或总时长超过 `ENV_POLL_MAX_ELAPSED_MS`
     * 即熔断（停轮询 + 清本地 task + 复位 busy + 单次 error toast）。
     *
     * 所有权：每次轮询捕获自己的 `active` 与 timer id；新轮询/调用方 clear 只停
     * 本实例，所有 await 之后的 store 写入与 toast 都必须过 `active` 检查，
     * 防止已卸载组件的旧 tick 覆盖新状态。
     *
     * @returns 清除函数（幂等，可重调）
     */
    pollEnvTaskWhileRunning: (): (() => void) => {
      cancelActiveEnvPoll?.();
      cancelActiveEnvPoll = null;
      clearEnvPollTimer();

      const started = get().envStatus?.task ?? null;
      if (
        started !== null &&
        started.error !== null &&
        started.error !== undefined &&
        started.error !== ''
      ) {
        // 陈旧 error 快照：本地终态化即可，重复 toast/错误卡是无意义回放。
        const status = get().envStatus;
        if (status !== null) {
          get().setEnvStatus({ ...status, task: null });
        }
        get().setEnvBusy(false);
        return () => {};
      }

      if (started === null && get().envStatus !== null) {
        get().setEnvBusy(false);
        return () => {};
      }

      let active = true;
      let timer: number | null = null;
      const pollStart = Date.now();
      let consecutiveFailures = 0;
      let capToastShown = false;
      let dep = started === null ? '' : depOfTaskKind(started.kind);
      let version = started === null ? '' : taskVersionOf(started, dep);
      let isUninstall = started?.kind.endsWith('-uninstall') ?? false;
      let hasTask = started !== null;

      const cleanup = (): void => {
        active = false;
        if (timer !== null) {
          window.clearInterval(timer);
          if (envPollTimer === timer) {
            envPollTimer = null;
          }
          timer = null;
        }
        if (cancelActiveEnvPoll === cleanup) {
          cancelActiveEnvPoll = null;
        }
      };

      const stopWithError = (): void => {
        if (!active) {
          return;
        }
        // 失败终态：本地清掉 task，行回到可操作态（失败信息只留在 toast/错误卡）。
        const status = get().envStatus;
        if (status !== null && status.task !== null) {
          get().setEnvStatus({ ...status, task: null });
        }
        get().setEnvBusy(false);
        if (hasTask && !capToastShown) {
          capToastShown = true;
          const template = isUninstall ? envDict(get).uninstallFailed : envDict(get).installFailed;
          get().showToast(fill(template, { dep }), 'error');
        }
        cleanup();
      };

      const tick = async (): Promise<void> => {
        if (!active) {
          return;
        }
        if (Date.now() - pollStart > ENV_POLL_MAX_ELAPSED_MS) {
          stopWithError();
          return;
        }
        let result: Awaited<ReturnType<typeof window.digitalLife.env.getStatus>>;
        try {
          result = await window.digitalLife.env.getStatus();
        } catch {
          if (!active) {
            return;
          }
          consecutiveFailures += 1;
          if (consecutiveFailures >= ENV_POLL_MAX_CONSECUTIVE_FAILURES) {
            stopWithError();
          }
          return;
        }
        if (!active) {
          return;
        }
        if (!result.ok) {
          consecutiveFailures += 1;
          if (consecutiveFailures >= ENV_POLL_MAX_CONSECUTIVE_FAILURES) {
            stopWithError();
          }
          return;
        }
        consecutiveFailures = 0;
        get().setEnvStatus(result.data);
        if (!active) {
          return;
        }
        if (Date.now() - pollStart > ENV_POLL_MAX_ELAPSED_MS) {
          stopWithError();
          return;
        }
        const task = result.data.task;
        if (!hasTask) {
          if (task === null) {
            // 启动时状态未知且首轮即无任务：无法证明任务归属，静默收尾不弹成功提示。
            get().setEnvBusy(false);
            cleanup();
            return;
          }
          hasTask = true;
          dep = depOfTaskKind(task.kind);
          version = taskVersionOf(task, dep);
          isUninstall = task.kind.endsWith('-uninstall');
        }
        if (task === null) {
          get().setEnvBusy(false);
          // 卸载成功不弹“已安装”文案：状态刷新已如实反映移除/回落结果。
          if (!isUninstall) {
            get().showToast(fill(envDict(get).installSuccess, { dep, version }), 'success');
          }
          cleanup();
          return;
        }
        if (task.error !== null && task.error !== undefined && task.error !== '') {
          captureError(get, task.error, SCOPE);
          // 终态失败：本地清掉 task（失败信息只留在 toast/错误卡），否则行会一直
          // 停在 "安装中" 扫光态且安装按钮不再出现（remount 由 taskForDep 兜底）。
          get().setEnvStatus({ ...result.data, task: null });
          stopWithError();
        }
      };

      timer = window.setInterval(() => {
        void tick();
      }, ENV_POLL_INTERVAL_MS);
      envPollTimer = timer;
      cancelActiveEnvPoll = cleanup;
      return cleanup;
    },
  };
}
