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
  /** 来源到达回调（供设置组维护侧边栏聚合信号；重挂/刷新都会触发）。 */
  onSource?: (source: OpencodeSourceStatus | null) => void;
}

function toResult(result: IpcResult<unknown>): HarnessVersionResult {
  return result.ok ? { ok: true } : { ok: false, error: result.error.message };
}

function toSourceStatus(source: OpencodeSourceStatus): HarnessVersionSourceStatus {
  const mode = source.versionSource.mode;
  const resolved = source.versionSource.resolvedByMode?.[mode] ?? null;
  return {
    mode,
    // 系统安装生效时隐藏管理项（与 DSH `managed` 语义一致）。
    managed: !(mode === 'system' || resolved === 'system'),
    ready: true,
  };
}

const OFFLINE_RESULT: HarnessVersionResult = { ok: false };

/**
 * 把 `window.digitalLife.opencode` 适配为通用版本卡片唯一的依赖面。
 *
 * 这里保留 OpenCode 组迁移前的全部前置逻辑：自动选源只在 `source_mode=auto`
 * 时执行，manual 模式不覆盖用户选择；任务轮询与重置默认行为由卡片统一驱动。
 *
 * 会话级快照缓存（stale-while-revalidate）：模块级 `cachedSnapshot` 在每次
 * `load` 成功后更新；卡片重挂时经 `peekSnapshot` 首帧即瞬显，后台仍静默再验证。
 * 来源偏好另落 localStorage（`peekSourceMode`），供冷启动骨架按来源定形。
 */
const MODE_KEY = 'adl:opencode.versionSourceMode';

let cachedSnapshot: HarnessVersionSnapshot<OpencodeSourceStatus> | null = null;

function readPersistedMode(): HarnessVersionSourceMode | null {
  try {
    const raw = window.localStorage?.getItem(MODE_KEY);
    if (raw === 'auto' || raw === 'system' || raw === 'host') {
      return raw;
    }
  } catch {
    // 隐私模式 localStorage 抛异常：回退未知，骨架按自动定形。
  }
  return null;
}

function writePersistedMode(mode: HarnessVersionSourceMode): void {
  try {
    window.localStorage?.setItem(MODE_KEY, mode);
  } catch {
    // 写失败静默忽略：只影响冷启动骨架形状，不影响功能。
  }
}

/** 设置面板打开时的冷填充预热：仅缓存为空时拉取，命中后 no-op。 */
export function prefetchOpencodeSnapshot(): Promise<void> {
  if (cachedSnapshot !== null) {
    return Promise.resolve();
  }
  const bridge = typeof window !== 'undefined' ? window.digitalLife?.opencode : undefined;
  if (!bridge) {
    return Promise.resolve();
  }
  return (async () => {
    try {
      const [status, catalog, source] = await Promise.all([
        bridge.getVersionStatus(),
        bridge.getVersionCatalog(),
        bridge.getSourceStatus(),
      ]);
      if (status.ok || catalog.ok || source.ok) {
        if (source.ok) {
          writePersistedMode(source.data.versionSource.mode);
        }
        cachedSnapshot = {
          status: status.ok ? status.data : null,
          catalog: catalog.ok ? catalog.data : null,
          source: source.ok ? toSourceStatus(source.data) : null,
          sourceExtra: source.ok ? source.data : null,
          // 目录腿失败必须透出：卡片据此显示「未知」，而不是误报「官方暂无」。
          catalogFailed: !catalog.ok,
        };
      }
    } catch {
      // 预热失败静默：挂载再验证兜底。
    }
  })();
}

/** 测试隔离：模块级缓存跨用例泄漏会让首帧骨架类断言失真。 */
export function resetOpencodeSnapshotCache(): void {
  cachedSnapshot = null;
}
export function createOpencodeVersionBridge(
  deps: OpencodeVersionBridgeDeps,
): HarnessVersionBridge<OpencodeSourceStatus> {
  const { bridge, toolName, t, testSource, saveSourceConfig, notify, onSource } = deps;
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
      // 检查更新只查询并提示（用户要求：不做升级动作）。
      updateAction: 'check',
      taskCounts: false,
      resetSourceAction: false,
      // 行内刷新按钮（检查/当前/正式/预发布）+ 分腿扫光。
      refreshRows: true,
      // 来源就绪/托管语义：首帧来源未到时隐藏管理项（与 DSH 同口径）。
      sourceManaged: true,
    },
    labels: {
      stable: t.opencodeStable,
      prerelease: t.opencodePrerelease,
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
        writePersistedMode(source.data.versionSource.mode);
        onSource?.(source.data);
      }
      const snapshot = {
        status: status.ok ? status.data : null,
        catalog: catalog.ok ? catalog.data : null,
        source: source.ok ? toSourceStatus(source.data) : null,
        sourceExtra: source.ok ? source.data : null,
        failed: !status.ok && !catalog.ok && !source.ok,
        // 与 DSH 适配器同口径：目录拉取失败 → 通道显示「未知」，不得误报「官方暂无」。
        catalogFailed: !catalog.ok,
      };
      cachedSnapshot = snapshot;
      return snapshot;
    },
    peekSnapshot: () => cachedSnapshot,
    peekSourceMode: () => cachedSnapshot?.source?.mode ?? readPersistedMode(),
    /**
     * 只检查更新（「检查更新」行）：查询 + 提示，不安装。结果文案三态
     * （无稳定版 / 发现新版 / 已是最新，含预发布分支；失败给失败提示，
     * 保证点击必有反馈）。
     */
    checkUpdate: async (): Promise<HarnessVersionResult> => {
      if (!bridge) {
        return OFFLINE_RESULT;
      }
      try {
        const [status, catalog] = await Promise.all([
          bridge.getVersionStatus(),
          bridge.getVersionCatalog(),
        ]);
        // 状态腿失败时不得按旧目录推断"暂无正式版本"：如实报检查失败。
        if (!status.ok) {
          notify(t.opencodeCheckUpdateFailed, 'error');
          return { ok: true };
        }
        const next = status.data;
        cachedSnapshot = {
          status: next,
          // 目录腿失败时保留旧目录值（通道行仍可展示上次结果），但失败标记必须如实置位。
          catalog: catalog.ok ? catalog.data : (cachedSnapshot?.catalog ?? null),
          source: cachedSnapshot?.source ?? null,
          sourceExtra: cachedSnapshot?.sourceExtra ?? null,
          catalogFailed: !catalog.ok,
        };
        if (!next.latestAvailable) {
          if (next.hasPrereleaseUpdate && next.prereleaseAvailable) {
            notify(
              t.opencodeCheckUpdatePrerelease.replace('{version}', next.prereleaseAvailable),
              'success',
            );
          } else {
            notify(t.opencodeCheckUpdateNoStable, 'warning');
          }
          return { ok: true };
        }
        if (next.hasUpdate) {
          notify(t.opencodeCheckUpdateFound.replace('{version}', next.latestAvailable), 'success');
        } else {
          notify(t.harnessVersionNoUpdate, 'success');
        }
        return { ok: true };
      } catch {
        notify(t.opencodeCheckUpdateFailed, 'error');
        return { ok: true };
      }
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
