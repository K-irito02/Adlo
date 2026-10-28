import type { DshSourceConfig, DshTestResult, IpcResult } from '@shared/ipc/dsh';
import type { CopyDict } from '@i18n/types';
import type { OpencodeBridge, OpencodeSourceStatus } from '@shared/ipc/opencode';
import { detectFastestSource } from '@features/network/sourceAutoDetect';
import type {
  HarnessVersionBridge,
  HarnessVersionResult,
  HarnessVersionSnapshot,
  HarnessVersionSourceMode,
  HarnessVersionSourceStatus,
  HarnessVersionTask,
  HarnessVersionTone,
} from '@features/harness/harnessVersionBridge';

export interface OpencodeVersionBridgeDeps {
  bridge: OpencodeBridge | undefined;
  /** 已本地化的工具名（通用文案 `{tool}` 插值）。 */
  toolName: string;
  t: CopyDict;
  testSource: (url: string, silent?: boolean) => Promise<DshTestResult | null>;
  saveSourceConfig: (config: DshSourceConfig, silent?: boolean) => Promise<boolean>;
  notify: (message: string, tone: HarnessVersionTone) => void;
}

function toResult(result: IpcResult<unknown>): HarnessVersionResult {
  return result.ok ? { ok: true } : { ok: false, error: result.error.message };
}

function toSourceStatus(source: OpencodeSourceStatus): HarnessVersionSourceStatus {
  return {
    mode: source.versionSource.mode,
    effective: source.versionSource.effective,
    systemPath: source.system?.path ?? null,
    ready: true,
  };
}

const OFFLINE_RESULT: HarnessVersionResult = { ok: false };

/**
 * 把 `window.digitalLife.opencode` 适配为通用版本卡片唯一的依赖面。
 *
 * 这里保留 OpenCode 组迁移前的全部前置逻辑：自动选源只在 `source_mode=auto`
 * 时执行，manual 模式不覆盖用户选择；任务轮询与重置默认行为由卡片统一驱动。
 */
export function createOpencodeVersionBridge(
  deps: OpencodeVersionBridgeDeps,
): HarnessVersionBridge<OpencodeSourceStatus> {
  const { bridge, toolName, t, testSource, saveSourceConfig, notify } = deps;
  let lastSource: OpencodeSourceStatus | null = null;

  const available = Boolean(bridge);

  const call = async (
    action: ((raw: OpencodeBridge) => Promise<IpcResult<unknown>>) | null,
  ): Promise<HarnessVersionResult> => {
    if (!bridge || !action) {
      return OFFLINE_RESULT;
    }
    return toResult(await action(bridge));
  };

  const install = async (version: string): Promise<HarnessVersionResult> => {
    const trimmed = version.trim();
    if (!bridge || !trimmed) {
      return OFFLINE_RESULT;
    }
    // 仅在「自动检测」模式下，安装前重新选源；manual 一律不覆盖用户选择。
    const currentSource = lastSource;
    if (currentSource?.config.source_mode === 'auto') {
      const winner = await detectFastestSource(testSource, true);
      if (winner && winner !== currentSource.config.npm_registry) {
        await saveSourceConfig({ source_mode: 'auto', npm_registry: winner }, true);
      }
    }
    return toResult(await bridge.installVersion(trimmed, true));
  };

  const saveSourceMode = (mode: HarnessVersionSourceMode) =>
    call((raw) => raw.saveVersionSource(mode));

  /** OpenCode 的阶段文案：四态固定，不把未知总量说成「下载中」。 */
  const taskStageText = (task: HarnessVersionTask | null): string => {
    if (!task) {
      return t.harnessVersionPhaseFinalizing;
    }
    switch (task.phase) {
      case 'preparing':
        return t.harnessVersionPhasePreparing;
      case 'installing':
        return t.harnessVersionPhaseInstalling;
      case 'removing':
        return t.harnessVersionPhaseRemoving;
      default:
        return t.harnessVersionPhaseFinalizing;
    }
  };

  return {
    toolName,
    available,
    capabilities: {
      uninstallConfirm: false,
      sourceModeChange: 'immediate',
      updateAction: 'install',
      taskPercent: true,
      taskCounts: false,
      resetSourceAction: true,
    },
    taskStageText,
    load: async (): Promise<HarnessVersionSnapshot<OpencodeSourceStatus>> => {
      if (!bridge) {
        return { status: null, catalog: null, source: null, sourceExtra: null, failed: false };
      }
      const [status, catalog, source] = await Promise.all([
        bridge.getVersionStatus(),
        bridge.getVersionCatalog(),
        bridge.getSourceStatus(),
      ]);
      if (source.ok) {
        lastSource = source.data;
      }
      return {
        status: status.ok ? status.data : null,
        catalog: catalog.ok ? catalog.data : null,
        source: source.ok ? toSourceStatus(source.data) : null,
        sourceExtra: source.ok ? source.data : null,
        failed: !status.ok && !catalog.ok && !source.ok,
      };
    },
    getTask: async () => {
      if (!bridge) {
        return null;
      }
      const result = await bridge.getVersionTask();
      return result.ok ? result.data.task : null;
    },
    install,
    update: () => call((raw) => raw.update()),
    revert: (version) => call((raw) => raw.revert(version)),
    uninstall: (version) => call((raw) => raw.uninstall(version)),
    reinstall: () => call((raw) => raw.reinstall()),
    cancel: () => call((raw) => raw.cancelVersionTask()),
    saveSourceMode,
    resetSourceMode: () => saveSourceMode('auto'),
    notify,
  };
}
