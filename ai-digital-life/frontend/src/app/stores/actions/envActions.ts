import type { StoreApi } from 'zustand';
import type { StoreState } from '../StoreState';
import type { EnvSourceMode } from '../../../shared/ipc/env';
import { captureError, clearError } from '../shared';
// Store 侧提示文案取静态语言包（与 gitBranchActions 同模式，不走 hook）：
// 失败走通用 `common.operationFailed`，安装完成复用已有的 `dsh.dshInstallSuccess`
// （`已安装 {version}`；environment.* 新文案归 Task 3，此处不新增 key）。
import { commonZh } from '../../i18n/zh-CN/common';
import { commonEn } from '../../i18n/en-US/common';
import { dshZh } from '../../i18n/zh-CN/dsh';
import { dshEn } from '../../i18n/en-US/dsh';
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

function envDict(get: () => StoreState) {
  const locale = resolveAppLanguage(get().appInfo?.config?.language);
  return {
    failure: (locale === 'en-US' ? commonEn : commonZh).operationFailed,
    installSuccess: (locale === 'en-US' ? dshEn : dshZh).dshInstallSuccess,
  };
}

function fill(template: string, vars: Record<string, string | number>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replace(`{${key}}`, String(value));
  }
  return out;
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
          get().setEnvBusy(false);
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
     * [pollEnvTaskWhileRunning - 安装任务进行中才轮询全量状态]
     *
     * 仅当 `envStatus.task` 非空时启动 3s 轮询；某次 tick 拿到 `task: null`
     * 即清定时器 + 终态刷新（tick 内已写）+ 成功 toast + envBusy 复位。
     * 轮询 tick fail-open：桥抛错 / !ok 静默跳过（下一轮自愈），不记卡；
     * 持续失败熔断（防 stale busy）：连续失败达
     * `ENV_POLL_MAX_CONSECUTIVE_FAILURES`（10 tick ≈ 30s）或自启动起
     * 超过 `ENV_POLL_MAX_ELAPSED_MS`（10min），清定时器 + envBusy 复位 +
     * 单次节流 error toast（复用通用 `common.operationFailed`，不新增 key）。
     * 成功 tick 重置连续失败计数、刷新状态。
     *
     * 清除契约：返回清除函数，调用方必须在 useEffect 返回里调用
     * （组件卸载清——照抄 DshVersionManagement 的 versionTask 轮询处置）；
     * 下一次 install/调用会先清旧定时器再起新的，不会并跑。
     *
     * @returns 清除函数（幂等，可重调）
     */
    pollEnvTaskWhileRunning: (): (() => void) => {
      clearEnvPollTimer();
      const started = get().envStatus?.task;
      if (!started) {
        get().setEnvBusy(false);
        return () => {};
      }
      const version = started.version;
      const pollStart = Date.now();
      let consecutiveFailures = 0;
      let capToastShown = false;
      const stopOnCap = (): void => {
        clearEnvPollTimer();
        get().setEnvBusy(false);
        if (!capToastShown) {
          capToastShown = true;
          get().showToast(envDict(get).failure, 'error');
        }
      };
      const tick = async (): Promise<void> => {
        if (Date.now() - pollStart > ENV_POLL_MAX_ELAPSED_MS) {
          stopOnCap();
          return;
        }
        let result: Awaited<ReturnType<typeof window.digitalLife.env.getStatus>>;
        try {
          result = await window.digitalLife.env.getStatus();
        } catch {
          consecutiveFailures += 1;
          if (consecutiveFailures >= ENV_POLL_MAX_CONSECUTIVE_FAILURES) {
            stopOnCap();
          }
          return;
        }
        if (!result.ok) {
          consecutiveFailures += 1;
          if (consecutiveFailures >= ENV_POLL_MAX_CONSECUTIVE_FAILURES) {
            stopOnCap();
          }
          return;
        }
        consecutiveFailures = 0;
        get().setEnvStatus(result.data);
        if (Date.now() - pollStart > ENV_POLL_MAX_ELAPSED_MS) {
          stopOnCap();
          return;
        }
        if (result.data.task === null) {
          clearEnvPollTimer();
          get().setEnvBusy(false);
          get().showToast(fill(envDict(get).installSuccess, { version }), 'success');
        }
      };
      envPollTimer = window.setInterval(() => {
        void tick();
      }, ENV_POLL_INTERVAL_MS);
      return () => {
        clearEnvPollTimer();
      };
    },
  };
}
