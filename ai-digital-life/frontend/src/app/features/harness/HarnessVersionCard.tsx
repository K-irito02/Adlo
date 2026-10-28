import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import type { CopyDict } from '@i18n/types';
import { SettingsHeader } from '../../components/settings/SettingsHeader';
import { SettingsHintButton } from '../../components/settings/SettingsHintButton';
import type {
  HarnessVersionBridge,
  HarnessVersionMutation,
  HarnessVersionResult,
  HarnessVersionSnapshot,
  HarnessVersionSourceMode,
  HarnessVersionSourceStatus,
  HarnessVersionTask,
  HarnessVersionTaskPhase,
  HarnessVersionTone,
} from './harnessVersionBridge';

export interface HarnessVersionSlotContext<TSource> {
  /** 有任一版本操作进行中。 */
  busy: boolean;
  /** `busy` 或底层桥不可用；插槽内控件应使用它控制 disabled。 */
  disabled: boolean;
  source: HarnessVersionSourceStatus | null;
  /** 工具专属来源数据（适配器提供）。 */
  sourceExtra: TSource | null;
  /** 走卡片的忙碌/反馈/刷新流程执行一个工具专属操作。 */
  run: (action: () => Promise<HarnessVersionResult>, successMessage: string) => Promise<void>;
  notify: (message: string, tone: HarnessVersionTone) => void;
}

export type HarnessVersionSlot<TSource> =
  | ReactNode
  | ((context: HarnessVersionSlotContext<TSource>) => ReactNode);

export interface HarnessVersionSlots<TSource> {
  /** 标题旁「?」提示内容；缺省使用通用说明。 */
  headerHint?: string;
  /** 版本来源行「?」提示内容；缺省使用通用说明。 */
  sourceHint?: string;
  /** 未安装引导横幅；缺省使用带 `{tool}` 插值的通用文案。 */
  missingBanner?: HarnessVersionSlot<TSource>;
  /** 来源卡片内的说明行（工具专属来源解释）。 */
  sourceNote?: HarnessVersionSlot<TSource>;
  /** 来源卡片尾部的工具内容（如 OpenCode 的终端可用性开关）。 */
  sourceFooter?: HarnessVersionSlot<TSource>;
  /** 当前版本读数旁的运行态内容（DSH 的运行地址/系统安装读数）。 */
  runtimeReadout?: HarnessVersionSlot<TSource>;
  /** 卡片尾部内容。 */
  footer?: HarnessVersionSlot<TSource>;
}

export interface HarnessVersionCardProps<TSource = unknown> {
  bridge: HarnessVersionBridge<TSource>;
  slots?: HarnessVersionSlots<TSource>;
}

function renderSlot<TSource>(
  slot: HarnessVersionSlot<TSource> | undefined,
  context: HarnessVersionSlotContext<TSource>,
): ReactNode {
  if (typeof slot === 'function') {
    return slot(context);
  }
  return slot ?? null;
}

function phaseLabel(phase: HarnessVersionTaskPhase, t: CopyDict): string {
  switch (phase) {
    case 'preparing':
      return t.harnessVersionPhasePreparing;
    case 'installing':
      return t.harnessVersionPhaseInstalling;
    case 'removing':
      return t.harnessVersionPhaseRemoving;
    default:
      return t.harnessVersionPhaseFinalizing;
  }
}

/**
 * 通用 harness 版本卡片：安装/更新/切换/卸载/重装、稳定与预发布通道、
 * 手动版本号、来源三态、任务进度与取消。
 *
 * 卡片只依赖 {@link HarnessVersionBridge} 与可选插槽，不读取任何 store，
 * 也不访问 `window.digitalLife`。
 */
export function HarnessVersionCard<TSource = unknown>({
  bridge,
  slots = {},
}: HarnessVersionCardProps<TSource>) {
  const { t, formatT } = useTCopy();
  const [snapshot, setSnapshot] = useState<HarnessVersionSnapshot<TSource> | null>(null);
  const [task, setTask] = useState<HarnessVersionTask | null>(null);
  const [busy, setBusy] = useState(false);
  const [stablePick, setStablePick] = useState('');
  const [manual, setManual] = useState('');
  const [uninstallArmed, setUninstallArmed] = useState<string | null>(null);

  const applySnapshot = useCallback((next: HarnessVersionSnapshot<TSource>) => {
    setSnapshot((previous) => ({
      // 腿级降级：某一路读取失败时保留上一次的值（与迁移前 OpenCode 行为一致）。
      status: next.status ?? previous?.status ?? null,
      catalog: next.catalog ?? previous?.catalog ?? null,
      source: next.source ?? previous?.source ?? null,
      sourceExtra: next.sourceExtra ?? previous?.sourceExtra ?? null,
      failed:
        next.failed === true && next.status === null && (previous?.status ?? null) === null,
    }));
    if (next.status) {
      setStablePick(
        (prev) => prev || next.status?.currentSelected || next.status?.latestAvailable || '',
      );
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await bridge.load();
      applySnapshot(next);
    } catch {
      applySnapshot({
        status: null,
        catalog: null,
        source: null,
        sourceExtra: null,
        failed: true,
      });
    }
  }, [applySnapshot, bridge]);

  useEffect(() => {
    let alive = true;
    void bridge
      .load()
      .then((next) => {
        if (alive) {
          applySnapshot(next);
        }
      })
      .catch(() => {
        if (alive) {
          applySnapshot({
            status: null,
            catalog: null,
            source: null,
            sourceExtra: null,
            failed: true,
          });
        }
      });
    return () => {
      alive = false;
    };
  }, [applySnapshot, bridge]);

  useEffect(() => {
    if (!busy || !bridge.available) {
      return;
    }
    let alive = true;
    const id = setInterval(() => {
      void bridge
        .getTask()
        .then((next) => {
          if (alive) {
            setTask(next);
          }
        })
        .catch(() => undefined);
    }, 800);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [busy, bridge]);

  const run = useCallback(
    async (
      action: () => Promise<HarnessVersionResult>,
      successMessage: string,
      mutation?: HarnessVersionMutation,
    ) => {
      if (!bridge.available) {
        return;
      }
      setBusy(true);
      setTask(null);
      try {
        const result = await action();
        if (!result.ok) {
          if (result.cancelled) {
            bridge.notify(t.harnessVersionCancelled, 'warning');
          } else {
            bridge.notify(result.error || t.harnessVersionOpFailed, 'error');
          }
          return;
        }
        if (mutation && bridge.afterMutation) {
          const follow = await bridge.afterMutation(mutation);
          if (!follow.ok) {
            bridge.notify(follow.error || t.harnessVersionOpFailed, 'error');
            return;
          }
        }
        bridge.notify(successMessage, 'success');
      } catch {
        bridge.notify(t.harnessVersionOpFailed, 'error');
      } finally {
        setBusy(false);
        setTask(null);
        await refresh();
      }
    },
    [bridge, refresh, t],
  );

  const status = snapshot?.status ?? null;
  const catalog = snapshot?.catalog ?? null;
  const source = snapshot?.source ?? null;
  const sourceExtra = snapshot?.sourceExtra ?? null;
  const current = status?.currentSelected ?? null;
  const installed = useMemo(() => status?.installed ?? [], [status]);
  const stable = useMemo(() => catalog?.stable ?? [], [catalog]);
  const latestPrerelease = catalog?.prerelease[0] ?? null;
  const sourceMode = source?.mode ?? 'auto';
  const disabled = busy || !bridge.available;

  useEffect(() => {
    setUninstallArmed(null);
  }, [current]);

  const headerHint = slots.headerHint ?? formatT(t.harnessVersionHint, { tool: bridge.toolName });
  const sourceHint =
    slots.sourceHint ?? formatT(t.harnessVersionSourceHint, { tool: bridge.toolName });

  const effectiveLabel = (() => {
    switch (source?.effective) {
      case 'running':
        return t.harnessVersionSourceRunning;
      case 'host':
        return t.harnessVersionSourceHost;
      case 'system':
        return t.harnessVersionSourceSystem;
      default:
        return t.harnessVersionSourceNone;
    }
  })();

  const slotContext: HarnessVersionSlotContext<TSource> = {
    busy,
    disabled,
    source,
    sourceExtra,
    run,
    notify: bridge.notify,
  };

  const installVersion = (version: string) => {
    if (!version.trim()) {
      return;
    }
    void run(() => bridge.install(version.trim()), t.harnessVersionInstallStarted, 'install');
  };

  const handleUninstall = (version: string) => {
    if (
      bridge.capabilities?.uninstallConfirm &&
      version === current &&
      uninstallArmed !== version
    ) {
      setUninstallArmed(version);
      return;
    }
    setUninstallArmed(null);
    void run(() => bridge.uninstall(version), t.harnessVersionUninstalled, 'uninstall');
  };

  const handleSourceChange = (mode: HarnessVersionSourceMode) => {
    const action =
      bridge.capabilities?.sourceModeChange === 'deferred' && bridge.changeSourceMode
        ? () => bridge.changeSourceMode!(mode)
        : () => bridge.saveSourceMode(mode);
    void run(action, t.harnessVersionSourceSaved);
  };

  return (
    <div className="adl-harness-version">
      <div className="adl-settings-storage__header adl-settings-storage__header--section">
        <SettingsHintButton content={headerHint} />
        <SettingsHeader title={formatT(t.harnessVersionTitle, { tool: bridge.toolName })} />
      </div>

      <div className="adl-settings-card">
        <div className="adl-settings-row">
          <div className="adl-settings-row__label">
            <div className="adl-settings-row__label-text">
              <span>{t.harnessVersionCurrent}</span>
            </div>
          </div>
          <div className="adl-settings-row__control">
            <span className="adl-harness-version__value">
              {current ?? t.harnessVersionNotInstalled}
            </span>
            <span className="adl-harness-version__hint">
              {t.harnessVersionEffectiveSource}: {effectiveLabel}
            </span>
            {renderSlot(slots.runtimeReadout, slotContext)}
          </div>
        </div>

        {snapshot?.failed ? (
          <div className="adl-settings-row">
            <div className="adl-settings-row__label">
              <div className="adl-settings-row__label-text">
                <span className="adl-harness-version__hint">{t.harnessVersionLoadFailed}</span>
              </div>
            </div>
          </div>
        ) : null}

        {!snapshot?.failed &&
        bridge.capabilities?.missingBanner !== false &&
        status !== null &&
        installed.length === 0 ? (
          <div className="adl-settings-row">
            <div className="adl-settings-row__label">
              <div className="adl-settings-row__label-text">
                <span className="adl-harness-version__hint">
                  {slots.missingBanner
                    ? renderSlot(slots.missingBanner, slotContext)
                    : formatT(t.harnessVersionMissingBanner, { tool: bridge.toolName })}
                </span>
              </div>
            </div>
          </div>
        ) : null}

        <div className="adl-settings-row">
          <div className="adl-settings-row__label">
            <div className="adl-settings-row__label-text">
              <span>{t.harnessVersionUpdate}</span>
            </div>
          </div>
          <div className="adl-settings-row__control">
            <span className="adl-harness-version__hint">
              {status?.hasUpdate ? t.harnessVersionHasUpdate : t.harnessVersionNoUpdate}
            </span>
            <button
              type="button"
              className="adl-harness-version__action-btn"
              disabled={disabled}
              onClick={() => void run(() => bridge.update(), t.harnessVersionUpdated, 'update')}
            >
              {t.harnessVersionUpdateAction}
            </button>
          </div>
        </div>

        <div className="adl-settings-row">
          <div className="adl-settings-row__label">
            <div className="adl-settings-row__label-text">
              <span>{t.harnessVersionStable}</span>
            </div>
          </div>
          <div className="adl-settings-row__control">
            <select
              className="adl-settings-dropdown"
              value={stablePick}
              disabled={disabled || stable.length === 0}
              onChange={(event) => setStablePick(event.target.value)}
            >
              {stable.map((info) => (
                <option key={info.version} value={info.version}>
                  {info.version}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="adl-harness-version__action-btn"
              disabled={disabled || !stablePick}
              onClick={() => installVersion(stablePick)}
            >
              {t.harnessVersionInstall}
            </button>
          </div>
        </div>

        {latestPrerelease ? (
          <div className="adl-settings-row">
            <div className="adl-settings-row__label">
              <div className="adl-settings-row__label-text">
                <span>{t.harnessVersionPrerelease}</span>
              </div>
            </div>
            <div className="adl-settings-row__control">
              <span className="adl-harness-version__value">{latestPrerelease.version}</span>
              <button
                type="button"
                className="adl-harness-version__action-btn"
                disabled={disabled}
                onClick={() => installVersion(latestPrerelease.version)}
              >
                {t.harnessVersionInstall}
              </button>
            </div>
          </div>
        ) : null}

        <div className="adl-settings-row">
          <div className="adl-settings-row__label">
            <div className="adl-settings-row__label-text">
              <span>{t.harnessVersionManual}</span>
            </div>
          </div>
          <div className="adl-settings-row__control">
            <input
              className="adl-settings-input"
              value={manual}
              placeholder={t.harnessVersionManualPlaceholder}
              disabled={disabled}
              onChange={(event) => setManual(event.target.value)}
            />
            <button
              type="button"
              className="adl-harness-version__action-btn"
              disabled={disabled || !manual.trim()}
              onClick={() => {
                installVersion(manual);
                setManual('');
              }}
            >
              {t.harnessVersionInstall}
            </button>
          </div>
        </div>
      </div>

      {installed.length > 0 ? (
        <div className="adl-settings-card">
          <div className="adl-settings-row">
            <div className="adl-settings-row__label">
              <div className="adl-settings-row__label-text">
                <span>{t.harnessVersionInstalled}</span>
              </div>
            </div>
          </div>
          {installed.map((version) => (
            <div className="adl-settings-row" key={version} data-harness-version-row={version}>
              <div className="adl-settings-row__label">
                <div className="adl-settings-row__label-text">
                  <span>{version}</span>
                  {version === current ? (
                    <span className="adl-harness-version__badge">
                      {t.harnessVersionCurrentBadge}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="adl-settings-row__control">
                <button
                  type="button"
                  className="adl-harness-version__action-btn"
                  disabled={disabled || version === current}
                  onClick={() =>
                    void run(() => bridge.revert(version), t.harnessVersionSwitched, 'switch')
                  }
                >
                  {t.harnessVersionSwitch}
                </button>
                <button
                  type="button"
                  className="adl-harness-version__action-btn adl-harness-version__action-btn--danger"
                  disabled={disabled}
                  onClick={() => handleUninstall(version)}
                >
                  {uninstallArmed === version
                    ? t.harnessVersionConfirmUninstall
                    : t.harnessVersionUninstall}
                </button>
              </div>
            </div>
          ))}
          <div className="adl-settings-row">
            <div className="adl-settings-row__label">
              <div className="adl-settings-row__label-text">
                <span>{t.harnessVersionReinstall}</span>
              </div>
            </div>
            <div className="adl-settings-row__control">
              <button
                type="button"
                className="adl-harness-version__action-btn"
                disabled={disabled || !current}
                onClick={() =>
                  void run(() => bridge.reinstall(), t.harnessVersionReinstalled, 'reinstall')
                }
              >
                {t.harnessVersionReinstall}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="adl-settings-card">
        <div className="adl-settings-row">
          <div className="adl-settings-row__label">
            <div className="adl-settings-row__label-text">
              <SettingsHintButton content={sourceHint} />
              <span>{t.harnessVersionSourceTitle}</span>
            </div>
          </div>
          <div className="adl-settings-row__control">
            <select
              className="adl-settings-dropdown"
              value={sourceMode}
              disabled={disabled}
              onChange={(event) =>
                handleSourceChange(event.target.value as HarnessVersionSourceMode)
              }
            >
              <option value="auto">{t.harnessVersionSourceAuto}</option>
              <option value="system">{t.harnessVersionSourceSystem}</option>
              <option value="host">{t.harnessVersionSourceHost}</option>
            </select>
          </div>
        </div>
        <div className="adl-settings-row">
          <div className="adl-settings-row__label">
            <div className="adl-settings-row__label-text">
              <span>{t.harnessVersionSystemPath}</span>
            </div>
          </div>
          <div className="adl-settings-row__control">
            <span className="adl-harness-version__value">
              {source?.systemPath ?? t.harnessVersionSystemNotDetected}
            </span>
          </div>
        </div>
        {slots.sourceNote ? (
          <div className="adl-settings-row">
            <div className="adl-settings-row__label">
              <div className="adl-settings-row__label-text">
                <span className="adl-harness-version__hint">
                  {renderSlot(slots.sourceNote, slotContext)}
                </span>
              </div>
            </div>
          </div>
        ) : null}
        {renderSlot(slots.sourceFooter, slotContext)}
      </div>

      {task ? (
        <div className="adl-settings-card">
          <div className="adl-settings-row">
            <div className="adl-settings-row__label">
              <div className="adl-settings-row__label-text">
                <span>
                  {bridge.capabilities?.taskStageText === false
                    ? t.harnessVersionTaskRunning
                    : phaseLabel(task.phase, t)}
                </span>
              </div>
            </div>
            <div className="adl-settings-row__control adl-harness-version__progress">
              {bridge.capabilities?.taskCounts && task.total > 0 ? (
                <span className="adl-harness-version__hint">
                  {formatT(t.harnessVersionTaskCount, { done: task.done, total: task.total })}
                </span>
              ) : null}
              <span className="adl-harness-version__value">
                {task.percent === null ? '—' : `${task.percent}%`}
              </span>
              {task.cancellable ? (
                <button
                  type="button"
                  className="adl-harness-version__action-btn"
                  onClick={() => void bridge.cancel()}
                >
                  {t.harnessVersionCancel}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {bridge.capabilities?.resetSourceAction !== false ? (
        <div className="adl-settings-card">
          <div className="adl-settings-row">
            <div className="adl-settings-row__label">
              <div className="adl-settings-row__label-text">
                <span>{t.harnessVersionResetDefaults}</span>
              </div>
            </div>
            <div className="adl-settings-row__control">
              <button
                type="button"
                className="adl-harness-version__action-btn"
                disabled={disabled || sourceMode === 'auto'}
                onClick={() => void run(() => bridge.resetSourceMode(), t.harnessVersionResetDone)}
              >
                {t.harnessVersionResetDefaults}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {renderSlot(slots.footer, slotContext)}
    </div>
  );
}
