import { useAppStore } from '@stores/slicedStore';
import type { CopyDict } from '@i18n/types';
import type {
  DshBridge,
  DshSourceConfig,
  DshSourceStatus,
  DshVersionSourceMode,
  DshVersionTask,
} from '../../../shared/ipc/dsh';
import type {
  HarnessVersionBridge,
  HarnessVersionMutation,
  HarnessVersionResult,
  HarnessVersionSnapshot,
  HarnessVersionSourceMode,
  HarnessVersionTone,
} from '../harness/harnessVersionBridge';
import { dshManageVisible, ensureDshRunning, type DshMayRestartResult } from './dshVersionRuntime';

/** 适配器依赖的最小 action 面（由 `useAppActions()` 提供）。 */
export interface DshVersionBridgeActions {
  fetchDshSettingsSnapshot: (silent?: boolean) => Promise<boolean>;
  fetchSourceStatus: (silent?: boolean) => Promise<boolean>;
  fetchVersionTask: () => Promise<void>;
  fetchDshVersionStatus: () => Promise<boolean>;
  fetchVersionCatalog: (silent?: boolean) => Promise<boolean>;
  cancelVersionTask: () => Promise<boolean>;
  updateDsh: () => Promise<boolean>;
  revertDsh: (version: string) => Promise<boolean>;
  uninstallDsh: (version: string) => Promise<boolean>;
  reinstallDsh: () => Promise<boolean>;
  installDshVersion: (version: string, select?: boolean) => Promise<boolean>;
  saveSourceConfig: (config: DshSourceConfig, silent?: boolean) => Promise<boolean>;
  restartDsh: () => Promise<DshMayRestartResult>;
}

export interface DshVersionBridgeDeps {
  /** `window.digitalLife.dsh`；缺失时卡片整体禁用。 */
  bridge: DshBridge | undefined;
  /** 已本地化的工具名（通用文案 `{tool}` 插值）。 */
  toolName: string;
  t: CopyDict;
  actions: DshVersionBridgeActions;
  notify: (message: string, tone: HarnessVersionTone) => void;
  /**
   * 版本来源三态切换：确认对话框、立即/下次启动语义由包装层拥有
   * （`DshSettings`），适配器只负责转发。
   */
  changeSourceMode: (mode: DshVersionSourceMode) => Promise<HarnessVersionResult>;
}

const OFFLINE: HarnessVersionResult = { ok: false };

/**
 * 把 DSH 的 store/actions 适配为通用版本卡片的唯一依赖面。
 *
 * 迁移前的编排全部保留在这里：每个变更操作括 `dshOpBusy`、取消请求映射为
 * `cancelled`（卡片以警告收尾）、变更成功后由 `afterMutation` 重启 dsh 并
 * 复核运行态。卡片只消费 `HarnessVersionBridge`，不感知 DSH store。
 */
export function createDshVersionBridge(
  deps: DshVersionBridgeDeps,
): HarnessVersionBridge<DshSourceStatus> {
  const { bridge, toolName, t, actions, notify, changeSourceMode } = deps;
  const available = Boolean(bridge);
  const state = () => useAppStore.getState();

  /** 最近一次变更的目标版本（`afterMutation` 只拿到操作种类，版本号由此取）。 */
  let lastTarget: string | null = null;
  /** 卸载当前版本前冻结的上下文（操作后 store 已翻新，读不到旧值）。 */
  let uninstallInUse = false;
  let preRunningUrl: string | null = null;

  const cancelRequested = () => state().versionTaskCancelRequested === true;

  /** 失败收尾：取消请求 → 警告；其余静默（action 已记录全局错误卡片）。 */
  const failed = (): HarnessVersionResult =>
    cancelRequested() ? { ok: false, cancelled: true } : { ok: false, silent: true };

  /** 异常兜底：取消请求 → 警告；否则给出该操作迁移前的失败文案。 */
  const thrown = (message: string): HarnessVersionResult =>
    cancelRequested() ? { ok: false, cancelled: true } : { ok: false, error: message };

  /** 操作收尾：清取消标记、刷新任务、释放 store 级 busy 门。 */
  const settle = () => {
    state().setVersionTaskCancelRequested(false);
    void actions.fetchVersionTask();
    state().setDshOpBusy(false);
  };

  const readSnapshot = (): HarnessVersionSnapshot<DshSourceStatus> => {
    const st = state();
    const source = st.sourceStatus;
    const versionSource = source?.versionSource ?? null;
    const mode: DshVersionSourceMode =
      versionSource?.mode ?? source?.config.version_source ?? 'auto';
    return {
      status: st.versionStatus,
      catalog: st.versionCatalog,
      source: source
        ? {
            mode,
            // 首帧 `resolvedByMode` 未到时管理项保持隐藏（迁移前 sourceReady）。
            ready: versionSource?.resolvedByMode != null,
            managed: dshManageVisible(source, st.dshVersionSourcePending),
          }
        : null,
      sourceExtra: source,
      // 首屏快照完整失败（三腿皆无数据）才进错误态；按腿降级沿用旧值。
      failed: st.settingsSnapshotFailed && st.versionStatus === null && source === null,
      catalogFailed: st.versionCatalogFailed === true,
    };
  };

  const install = async (version: string): Promise<HarnessVersionResult> => {
    const trimmed = version.trim();
    if (!bridge || !trimmed) {
      return OFFLINE;
    }
    lastTarget = trimmed;
    state().setDshOpBusy(true);
    try {
      const ok = await actions.installDshVersion(trimmed, true);
      if (!ok) {
        return failed();
      }
      return { ok: true };
    } catch {
      return thrown(t.dshInstallFailed);
    } finally {
      settle();
    }
  };

  const revert = async (version: string): Promise<HarnessVersionResult> => {
    if (!bridge) {
      return OFFLINE;
    }
    lastTarget = version;
    state().setDshOpBusy(true);
    try {
      const ok = await actions.revertDsh(version);
      if (!ok) {
        return failed();
      }
      return { ok: true };
    } catch {
      return thrown(t.dshRevertFailed);
    } finally {
      settle();
    }
  };

  const uninstall = async (version: string): Promise<HarnessVersionResult> => {
    if (!bridge) {
      return OFFLINE;
    }
    lastTarget = version;
    // 卸载到空后关标签用：操作前记下运行中 URL（操作后 running 即无）。
    preRunningUrl = state().sourceStatus?.running?.url ?? null;
    // 被卸载的是当前选中版本 → 完成后必须重启（唯一需要重启的情形）。
    uninstallInUse = version === state().versionStatus?.currentSelected;
    state().setDshOpBusy(true);
    try {
      const ok = await actions.uninstallDsh(version);
      if (!ok) {
        return failed();
      }
      return { ok: true };
    } catch {
      return thrown(t.dshUninstallFailed);
    } finally {
      settle();
    }
  };

  const reinstall = async (): Promise<HarnessVersionResult> => {
    if (!bridge) {
      return OFFLINE;
    }
    lastTarget = state().versionStatus?.currentSelected ?? null;
    state().setDshOpBusy(true);
    try {
      const ok = await actions.reinstallDsh();
      if (!ok) {
        return failed();
      }
      return { ok: true };
    } catch {
      return thrown(t.dshReinstallFailed);
    } finally {
      settle();
    }
  };

  /**
   * 行内「重装」非当前版本：只修目录、不改选中（`select=false`），也不重启。
   * 与迁移前 `handleInstallVersion(v, section, false)` 的成功文案一致。
   */
  const reinstallVersion = async (version: string): Promise<HarnessVersionResult> => {
    if (!bridge) {
      return OFFLINE;
    }
    lastTarget = version;
    state().setDshOpBusy(true);
    try {
      const ok = await actions.installDshVersion(version, false);
      if (!ok) {
        return failed();
      }
      return { ok: true, message: t.dshReinstalledOnly.replace('{version}', version) };
    } catch {
      return thrown(t.dshReinstallFailed);
    } finally {
      settle();
    }
  };

  const withVersion = (template: string, version: string | null) =>
    template.replace('{version}', version ?? '');

  const update = async (): Promise<HarnessVersionResult> => {
    if (!bridge) {
      return OFFLINE;
    }
    state().setDshOpBusy(true);
    try {
      const ok = await actions.updateDsh();
      if (!ok) {
        return failed();
      }
      lastTarget = state().versionStatus?.currentSelected ?? null;
      return { ok: true };
    } catch {
      return thrown(t.dshUpdateFailed);
    } finally {
      settle();
    }
  };

  /**
   * 只检查更新（DSH 的「检查更新」行）：查询 + 提示，不安装。结果文案沿用
   * 迁移前的三态（含失败分支；旧 `handleCheckUpdate` 在抓取失败时直接返回，
   * 不做旧值推断——失败只记全局错误卡片；此处额外给一个失败 toast，保证点击
   * 必有反馈，避免“只闪一下”的无响应感）。
   */
  const checkUpdate = async (): Promise<HarnessVersionResult> => {
    if (!bridge) {
      return OFFLINE;
    }
    try {
      const ok = await actions.fetchDshVersionStatus();
      if (!ok) {
        notify(t.dshCheckUpdateFailed, 'error');
        return { ok: true };
      }
      const st = state().versionStatus;
      if (!st?.latestAvailable) {
        if (st?.hasPrereleaseUpdate && st.prereleaseAvailable) {
          notify(withVersion(t.dshCheckUpdatePrerelease, st.prereleaseAvailable), 'success');
        } else {
          notify(t.dshCheckUpdateNoStable, 'warning');
        }
      } else if (st.hasUpdate) {
        notify(withVersion(t.dshCheckUpdateFound, st.latestAvailable), 'success');
      } else {
        notify(t.harnessVersionNoUpdate, 'success');
      }
      // 检查更新顺带静默刷新官方目录，供正式版/预发布列表展示。
      void actions.fetchVersionCatalog(true);
      return { ok: true };
    } catch {
      notify(t.dshCheckUpdateFailed, 'error');
      return { ok: true };
    }
  };

  /**
   * 变更成功后的运行态编排（迁移前每个 handler 成功分支的等价体）：
   * 重启 → 复核运行态 → 无进程且有可用来源时兜底拉起 → 按最终结果给出
   * 与迁移前一致的完成文案（含“仅保存”“重启失败”分支）。
   */
  const afterMutation = async (kind: HarnessVersionMutation): Promise<HarnessVersionResult> => {
    if (!bridge) {
      return OFFLINE;
    }
    state().setDshOpBusy(true);
    try {
      // 卸载非当前版本不影响运行中的进程：只刷新来源读数。
      if (kind === 'uninstall' && !uninstallInUse) {
        await actions.fetchSourceStatus(true);
        return { ok: true, message: withVersion(t.dshUninstallSuccess, lastTarget) };
      }
      const restart = await actions.restartDsh();
      await actions.fetchSourceStatus(true);
      let fin: DshMayRestartResult = restart;
      if (!fin.restarted) {
        fin = (await ensureDshRunning(actions, kind === 'uninstall' ? preRunningUrl : null)) ?? fin;
      }
      if (fin.failed) {
        return { ok: false, error: t.dshRestartFailed };
      }
      const next = state().versionStatus?.currentSelected ?? null;
      switch (kind) {
        case 'uninstall':
          return {
            ok: true,
            message: next
              ? withVersion(t.dshUninstalledSwitched, lastTarget).replace('{next}', next)
              : withVersion(t.dshUninstalledNoVersion, lastTarget),
          };
        case 'switch':
          return {
            ok: true,
            message: fin.restarted
              ? withVersion(t.dshSwitchedRestarted, lastTarget)
              : withVersion(t.dshSwitchedOnly, lastTarget),
          };
        case 'reinstall':
          return {
            ok: true,
            message: fin.restarted
              ? withVersion(t.dshReinstalledRestarted, lastTarget)
              : withVersion(t.dshReinstalledOnly, lastTarget),
          };
        default:
          return {
            ok: true,
            message: fin.restarted
              ? withVersion(t.dshInstalledRestarted, lastTarget ?? next)
              : withVersion(t.dshInstallSuccess, lastTarget ?? next),
          };
      }
    } catch {
      return { ok: false, error: t.dshRestartFailed };
    } finally {
      uninstallInUse = false;
      preRunningUrl = null;
      state().setDshOpBusy(false);
    }
  };

  const saveSourceMode = async (mode: HarnessVersionSourceMode): Promise<HarnessVersionResult> => {
    if (!bridge) {
      return OFFLINE;
    }
    const ok = await actions.saveSourceConfig({ version_source: mode }, true);
    if (!ok) {
      notify(t.dshSettingsSaveFailed, 'error');
      return { ok: false, silent: true };
    }
    // 直接落盘即「本次生效」，清掉可能残留的下次启动 pending。
    state().setDshVersionSourcePending(null);
    state().setDshVersionSourceDeferred(false);
    await actions.fetchSourceStatus(true);
    return { ok: true };
  };

  /** 任务阶段文案（迁移前 DSH 口径：阶段文字单独显示，计数由卡片 `taskCounts` 渲染）。 */
  const taskStageText = (task: DshVersionTask | null): string => {
    if (!task) {
      return t.dshTaskStageFinalizing;
    }
    switch (task.phase) {
      case 'preparing':
        return t.dshTaskStagePreparing;
      case 'installing':
        return task.total > 0 ? t.dshTaskStageInstalling : t.dshTaskStageDownloading;
      case 'removing':
        return task.total > 0 ? t.dshTaskStageRemoving : t.dshTaskStagePreparing;
      default:
        return t.dshTaskStageFinalizing;
    }
  };

  const taskCancelLabel = (task: DshVersionTask): string =>
    task.kind === 'dsh-uninstall'
      ? t.dshCancelUninstall
      : task.kind === 'dsh-reinstall'
        ? t.dshCancelReinstall
        : t.dshCancelInstall;

  return {
    toolName,
    available,
    capabilities: {
      uninstallConfirm: true,
      sourceModeChange: 'deferred',
      updateAction: 'check',
      taskCounts: true,
      resetSourceAction: false,
      sourceManaged: true,
      // 行级刷新：来源 / 当前版本 / 正式版本 / 预发布版本（检查更新行不提供）。
      refreshRows: { source: true, current: true, stable: true, prerelease: true },
    },
    labels: {
      stable: t.dshOfficialStable,
      prerelease: t.dshPrereleaseTitle,
      uninstallCurrentHint: t.dshUninstallCurrentHint,
    },
    taskStageText,
    taskCancelLabel,
    load: async () => {
      // 首屏/操作后一次原子快照：source + version + catalog 同一次提交。
      await actions.fetchDshSettingsSnapshot();
      return readSnapshot();
    },
    // store 常驻供给：切组重挂首帧即瞬显，后台仍静默再验证。
    // 失败标记同样同步透出：快照读取失败时首帧即错误态，不画无限骨架。
    peekSnapshot: () => {
      const snap = readSnapshot();
      return snap.status !== null || snap.source !== null || snap.failed === true ? snap : null;
    },
    peekSourceMode: () =>
      state().sourceStatus?.versionSource?.mode ??
      state().sourceStatus?.config.version_source ??
      null,
    getTask: async (): Promise<DshVersionTask | null> => {
      await actions.fetchVersionTask();
      return state().versionTask;
    },
    install,
    update,
    checkUpdate,
    revert,
    reinstallVersion,
    uninstall,
    reinstall,
    cancel: async () => {
      if (!bridge) {
        return OFFLINE;
      }
      const ok = await actions.cancelVersionTask();
      if (!ok) {
        notify(t.dshVersionCancelFailed, 'error');
      }
      return { ok };
    },
    saveSourceMode,
    resetSourceMode: () => saveSourceMode('auto'),
    changeSourceMode,
    afterMutation,
    notify,
  };
}
