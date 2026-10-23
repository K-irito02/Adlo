import type { StoreApi } from 'zustand';
import type { StoreState } from '../StoreState';
import type { EnvSourceMode, EnvTask } from '../../../shared/ipc/env';
import { envDepLabel } from '../../features/environment/depLabels';
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
  const environment = locale === 'en-US' ? environmentEn : environmentZh;
  return {
    failure: (locale === 'en-US' ? commonEn : commonZh).operationFailed,
    installSuccess: environment.environmentInstallSuccess,
    installFailed: environment.environmentInstallFailed,
    uninstallFailed: environment.environmentUninstallFailed,
    /** 插值进 toast 的依赖名必须是本地化展示名，而不是 wire slug。 */
    depName: (dep: string) => envDepLabel(environment, dep),
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

/**
 * 失败任务的身份键：`kind + version + error`。
 * 轮询启动时捕获一次（安装/卸载路径捕获变异前的快照），tick 上遇到 task.error
 * 只有身份一致才视为「启动前就存在的陈旧快照」静默清除；否则是本次操作窗口内
 * 新产生的失败，必须照常 toast + 错误卡（N-01）。
 */
function taskErrorKey(task: EnvTask | null): string | null {
  const error = task?.error ?? '';
  return task !== null && error !== '' ? `${task.kind}\u0000${task.version}\u0000${error}` : null;
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
        get().showToast(
          fill(envDict(get).installFailed, { dep: envDict(get).depName(dep) }),
          'error',
        );
        get().setEnvBusy(false);
        return false;
      }
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        get().showToast(
          fill(envDict(get).installFailed, { dep: envDict(get).depName(dep) }),
          'error',
        );
        get().setEnvBusy(false);
        return false;
      }
      // 静默刷新是 best-effort（内部吞错/!ok，不影响控制流）：无论成功与否都启动轮询，
      // 已接受的任务不会因刷新失败而无人跟进（busy 仍为 true，poll 不会因空闲提前退出）。
      await refreshEnvStatusSilently(get);
      get().pollEnvTaskWhileRunning({ suppressInitialError: false });
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
        get().showToast(
          fill(envDict(get).uninstallFailed, { dep: envDict(get).depName(dep) }),
          'error',
        );
        get().setEnvBusy(false);
        return false;
      }
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        get().showToast(
          fill(envDict(get).uninstallFailed, { dep: envDict(get).depName(dep) }),
          'error',
        );
        get().setEnvBusy(false);
        return false;
      }
      // 静默刷新是 best-effort（内部吞错/!ok，不影响控制流）：无论成功与否都启动轮询，
      // 已接受的任务不会因刷新失败而无人跟进（busy 仍为 true，poll 不会因空闲提前退出）。
      await refreshEnvStatusSilently(get);
      get().pollEnvTaskWhileRunning({ suppressInitialError: false });
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
     * 空闲（`task === null` 且 `envBusy === false`）不起轮询，避免每次挂载多打一次
     * 全量检测（N-03）。
     * 某次 tick 拿到 `task: null` 即停轮询 + 成功 toast（仅安装类任务）+ 复位 busy。
     * `task.error` 非空视为终态失败：停轮询、清本地 task、复位 busy、toast 域错误。
     * 挂载/采纳路径启动前就存在的失败快照只静默清除、不重放；安装/卸载发起的轮询
     * 则把首个 error 一律视为本次操作的新失败（N-F2）。
     * tick fail-open：桥抛错 / !ok 静默跳过（下一轮自愈），持续失败达
     * `ENV_POLL_MAX_CONSECUTIVE_FAILURES` 或总时长超过 `ENV_POLL_MAX_ELAPSED_MS`
     * 即熔断（停轮询 + 清本地 task + 复位 busy + 单次 error toast）。
     *
     * 所有权：每次轮询捕获自己的 `active` 与 timer id；新轮询只停旧实例的计时器。
     * 轮询由 store 持有：查看组件的卸载不得清除正在进行的任务轮询（component 挂载
     * 只在需要时启动，终态自停）。所有 await 之后的 store 写入与 toast 都必须过
     * `active` 检查，防止已卸载组件的旧 tick 覆盖新状态。
     *
     * 早退（陈旧失败/空闲）在取消旧计时器之前判定：查看路径的调用不得杀掉
     * action-owned 的活跃轮询（N-F3）。
     *
     * @param options.suppressInitialError `true`（默认，挂载/采纳）：启动快照已带
     *   error 视为陈旧失败，直接本地终态化且不起轮询；`false`（install/uninstall）：
     *   该 error 可能是本次重试产生的新失败（文本可能完全相同），必须照常上报。
     * @returns 清除函数（幂等，可重调）
     */
    pollEnvTaskWhileRunning: (options?: { suppressInitialError?: boolean }): (() => void) => {
      const suppressInitialError = options?.suppressInitialError ?? true;
      const started = get().envStatus?.task ?? null;
      const startedErrorKey = taskErrorKey(started);

      // 早退必须先于取消：不得因挂载/查看路径杀掉正在运行的轮询。
      if (suppressInitialError && startedErrorKey !== null) {
        // 无活跃轮询时才把陈旧失败本地终态化；有活跃轮询时交给它的下个 tick。
        if (cancelActiveEnvPoll === null) {
          const status = get().envStatus;
          if (status !== null) {
            get().setEnvStatus({ ...status, task: null });
          }
          get().setEnvBusy(false);
        }
        return () => {};
      }

      // N-03：空闲挂载不启动轮询（无任务且无进行中操作），也不打断已有轮询。
      if (started === null && !get().envBusy) {
        return () => {};
      }

      // 确认要启动新轮询后才取消旧实例。
      cancelActiveEnvPoll?.();
      cancelActiveEnvPoll = null;
      clearEnvPollTimer();

      // 带 error 的启动快照不是「进行中任务」：交给首个 tick 重新采纳/判定。
      const liveStarted = started !== null && startedErrorKey === null ? started : null;

      let active = true;
      let timer: number | null = null;
      const pollStart = Date.now();
      let consecutiveFailures = 0;
      let capToastShown = false;
      let dep = liveStarted === null ? '' : depOfTaskKind(liveStarted.kind);
      let version = liveStarted === null ? '' : taskVersionOf(liveStarted, dep);
      let isUninstall = liveStarted?.kind.endsWith('-uninstall') ?? false;
      let hasTask = liveStarted !== null;

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
          const dict = envDict(get);
          const template = isUninstall ? dict.uninstallFailed : dict.installFailed;
          get().showToast(fill(template, { dep: dict.depName(dep) }), 'error');
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
            const dict = envDict(get);
            get().showToast(
              fill(dict.installSuccess, { dep: dict.depName(dep), version }),
              'success',
            );
          }
          cleanup();
          return;
        }
        if (task.error !== null && task.error !== undefined && task.error !== '') {
          // 终态失败：本地清掉 task（失败信息只留在 toast/错误卡），否则行会一直
          // 停在 "安装中" 扫光态且安装按钮不再出现（remount 由 taskForDep 兜底）。
          // 不再按错误文本比对去重：相同文本可能是重试后的新失败（N-F2）。
          get().setEnvStatus({ ...result.data, task: null });
          captureError(get, task.error, SCOPE);
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
