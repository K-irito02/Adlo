import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { useAppActions } from '@hooks/useAppActions';
import { detectFastestSource } from '../network/sourceAutoDetect';
import { SettingsHeader } from '../../components/settings/SettingsHeader';
import { SettingsHintButton } from '../../components/settings/SettingsHintButton';
import type {
  DshVersionCatalog,
  DshVersionSourceMode,
  DshVersionStatus,
  DshVersionTask,
  IpcResult,
  OpencodeSourceStatus,
} from '../../../shared/ipc';

const EMPTY_STABLE: DshVersionCatalog['stable'] = [];

/**
 * 「OpenCode CLI」设置组：版本管理 + 版本来源 + 终端可用性说明。
 *
 * 与 DSH 组共享同一套后端版本内核（`adl_harness_version`），但没有运行态
 * （无端口/标签/auth）；安装产物是自包含 exe，终端 PATH 注入由服务端在
 * 新会话创建时完成。
 */
export function OpencodeSettings() {
  const { t } = useTCopy();
  const showToast = useAppStore((s) => s.showToast);
  const actions = useAppActions();
  const bridge = typeof window !== 'undefined' ? window.digitalLife?.opencode : undefined;

  const [status, setStatus] = useState<DshVersionStatus | null>(null);
  const [catalog, setCatalog] = useState<DshVersionCatalog | null>(null);
  const [source, setSource] = useState<OpencodeSourceStatus | null>(null);
  const [task, setTask] = useState<DshVersionTask | null>(null);
  const [busy, setBusy] = useState(false);
  const [stablePick, setStablePick] = useState('');
  const [manual, setManual] = useState('');

  const refresh = useCallback(async () => {
    if (!bridge) {
      return;
    }
    const [s, c, src] = await Promise.all([
      bridge.getVersionStatus(),
      bridge.getVersionCatalog(),
      bridge.getSourceStatus(),
    ]);
    if (s.ok) {
      setStatus(s.data);
      setStablePick((prev) => prev || s.data.currentSelected || s.data.latestAvailable || '');
    }
    if (c.ok) {
      setCatalog(c.data);
    }
    if (src.ok) {
      setSource(src.data);
    }
  }, [bridge]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!busy || !bridge) {
      return;
    }
    const id = setInterval(() => {
      void bridge.getVersionTask().then((r) => {
        if (r.ok) {
          setTask(r.data.task);
        }
      });
    }, 800);
    return () => clearInterval(id);
  }, [busy, bridge]);

  const run = useCallback(
    async (action: () => Promise<IpcResult<unknown>>, success: string) => {
      if (!bridge) {
        return;
      }
      setBusy(true);
      setTask(null);
      try {
        const result = await action();
        if (result.ok) {
          showToast(success, 'success');
        } else {
          showToast(result.error.message || t.opencodeOpFailed, 'error');
        }
      } finally {
        setBusy(false);
        setTask(null);
        await refresh();
      }
    },
    [bridge, refresh, showToast, t],
  );

  const stable = catalog?.stable ?? EMPTY_STABLE;
  const latestPrerelease = catalog?.prerelease[0] ?? null;
  const current = status?.currentSelected ?? null;
  const installed = status?.installed ?? [];
  const sourceMode: DshVersionSourceMode = source?.versionSource.mode ?? 'auto';
  const effective = source?.versionSource.effective ?? 'none';

  const effectiveLabel = useMemo(() => {
    switch (effective) {
      case 'host':
        return t.opencodeSourceHost;
      case 'system':
        return t.opencodeSourceSystem;
      default:
        return t.opencodeSourceNone;
    }
  }, [effective, t]);

  const phaseLabel = useCallback(
    (phase: DshVersionTask['phase'] | undefined) => {
      switch (phase) {
        case 'preparing':
          return t.opencodePhasePreparing;
        case 'installing':
          return t.opencodePhaseInstalling;
        case 'removing':
          return t.opencodePhaseRemoving;
        default:
          return t.opencodePhaseFinalizing;
      }
    },
    [t],
  );

  const installVersion = (version: string) => {
    if (!version.trim()) {
      return;
    }
    void run(async () => {
      // 仅在「自动检测」模式下，安装前重新选源；manual 一律不覆盖用户选择。
      if (source?.config.source_mode === 'auto') {
        const winner = await detectFastestSource(actions.testSource, true);
        if (winner && winner !== source.config.npm_registry) {
          await actions.saveSourceConfig({ source_mode: 'auto', npm_registry: winner }, true);
        }
      }
      return bridge!.installVersion(version.trim(), true);
    }, t.opencodeInstallStarted);
  };

  return (
    <div className="adl-settings-section adl-opencode-settings">
      <div
        className="adl-settings-storage__header adl-settings-storage__header--section"
        data-settings-anchor="settings-opencode-version"
      >
        <SettingsHintButton content={t.opencodeVersionHint} />
        <SettingsHeader title={t.opencodeVersionTitle} />
      </div>

      <div className="adl-settings-card">
        <div className="adl-settings-row">
          <div className="adl-settings-row__label">
            <div className="adl-settings-row__label-text">
              <span>{t.opencodeCurrentVersion}</span>
            </div>
          </div>
          <div className="adl-settings-row__control">
            <span className="adl-opencode-settings__value">
              {current ?? t.opencodeNotInstalled}
            </span>
            <span className="adl-opencode-settings__hint">
              {t.opencodeSourceEffective}: {effectiveLabel}
            </span>
          </div>
        </div>

        {status !== null && installed.length === 0 ? (
          <div className="adl-settings-row">
            <div className="adl-settings-row__label">
              <div className="adl-settings-row__label-text">
                <span className="adl-opencode-settings__hint">
                  {t.harnessMissingBannerOpencode}
                </span>
              </div>
            </div>
          </div>
        ) : null}

        <div className="adl-settings-row">
          <div className="adl-settings-row__label">
            <div className="adl-settings-row__label-text">
              <span>{t.opencodeUpdate}</span>
            </div>
          </div>
          <div className="adl-settings-row__control">
            <span className="adl-opencode-settings__hint">
              {status?.hasUpdate ? t.opencodeHasUpdate : t.opencodeNoUpdate}
            </span>
            <button
              type="button"
              className="adl-opencode-settings__action-btn"
              disabled={busy || !bridge}
              onClick={() => void run(() => bridge!.update(), t.opencodeUpdated)}
            >
              {t.opencodeCheckUpdate}
            </button>
          </div>
        </div>

        <div className="adl-settings-row">
          <div className="adl-settings-row__label">
            <div className="adl-settings-row__label-text">
              <span>{t.opencodeStable}</span>
            </div>
          </div>
          <div className="adl-settings-row__control">
            <select
              className="adl-settings-dropdown"
              value={stablePick}
              disabled={busy || stable.length === 0}
              onChange={(e) => setStablePick(e.target.value)}
            >
              {stable.map((v) => (
                <option key={v.version} value={v.version}>
                  {v.version}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="adl-opencode-settings__action-btn"
              disabled={busy || !bridge || !stablePick}
              onClick={() => installVersion(stablePick)}
            >
              {t.opencodeInstall}
            </button>
          </div>
        </div>

        {latestPrerelease ? (
          <div className="adl-settings-row">
            <div className="adl-settings-row__label">
              <div className="adl-settings-row__label-text">
                <span>{t.opencodePrerelease}</span>
              </div>
            </div>
            <div className="adl-settings-row__control">
              <span className="adl-opencode-settings__value">{latestPrerelease.version}</span>
              <button
                type="button"
                className="adl-opencode-settings__action-btn"
                disabled={busy || !bridge}
                onClick={() => installVersion(latestPrerelease.version)}
              >
                {t.opencodeInstall}
              </button>
            </div>
          </div>
        ) : null}

        <div className="adl-settings-row">
          <div className="adl-settings-row__label">
            <div className="adl-settings-row__label-text">
              <span>{t.opencodeManualVersion}</span>
            </div>
          </div>
          <div className="adl-settings-row__control">
            <input
              className="adl-settings-input"
              value={manual}
              placeholder={t.opencodeManualVersionPlaceholder}
              disabled={busy}
              onChange={(e) => setManual(e.target.value)}
            />
            <button
              type="button"
              className="adl-opencode-settings__action-btn"
              disabled={busy || !bridge || !manual.trim()}
              onClick={() => {
                installVersion(manual);
                setManual('');
              }}
            >
              {t.opencodeInstall}
            </button>
          </div>
        </div>
      </div>

      {installed.length > 0 ? (
        <div className="adl-settings-card">
          <div className="adl-settings-row">
            <div className="adl-settings-row__label">
              <div className="adl-settings-row__label-text">
                <span>{t.opencodeInstalledVersions}</span>
              </div>
            </div>
          </div>
          {installed.map((version) => (
            <div className="adl-settings-row" key={version}>
              <div className="adl-settings-row__label">
                <div className="adl-settings-row__label-text">
                  <span>{version}</span>
                  {version === current ? (
                    <span className="adl-opencode-settings__badge">{t.opencodeCurrentBadge}</span>
                  ) : null}
                </div>
              </div>
              <div className="adl-settings-row__control">
                <button
                  type="button"
                  className="adl-opencode-settings__action-btn"
                  disabled={busy || !bridge || version === current}
                  onClick={() => void run(() => bridge!.revert(version), t.opencodeSwitched)}
                >
                  {t.opencodeSwitch}
                </button>
                <button
                  type="button"
                  className="adl-opencode-settings__action-btn adl-opencode-settings__action-btn--danger"
                  disabled={busy || !bridge}
                  onClick={() => void run(() => bridge!.uninstall(version), t.opencodeUninstalled)}
                >
                  {t.opencodeUninstall}
                </button>
              </div>
            </div>
          ))}
          <div className="adl-settings-row">
            <div className="adl-settings-row__label">
              <div className="adl-settings-row__label-text">
                <span>{t.opencodeReinstall}</span>
              </div>
            </div>
            <div className="adl-settings-row__control">
              <button
                type="button"
                className="adl-opencode-settings__action-btn"
                disabled={busy || !bridge || !current}
                onClick={() => void run(() => bridge!.reinstall(), t.opencodeReinstalled)}
              >
                {t.opencodeReinstall}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="adl-settings-card">
        <div className="adl-settings-row">
          <div className="adl-settings-row__label">
            <div className="adl-settings-row__label-text">
              <SettingsHintButton content={t.opencodeSourceHint} />
              <span>{t.opencodeSourceTitle}</span>
            </div>
          </div>
          <div className="adl-settings-row__control">
            <select
              className="adl-settings-dropdown"
              value={sourceMode}
              disabled={busy || !bridge}
              onChange={(e) => {
                const mode = e.target.value as DshVersionSourceMode;
                void run(() => bridge!.saveVersionSource(mode), t.opencodeSourceSaved);
              }}
            >
              <option value="auto">{t.opencodeSourceAuto}</option>
              <option value="system">{t.opencodeSourceSystem}</option>
              <option value="host">{t.opencodeSourceHost}</option>
            </select>
          </div>
        </div>
        <div className="adl-settings-row">
          <div className="adl-settings-row__label">
            <div className="adl-settings-row__label-text">
              <span>{t.opencodeSystemPath}</span>
            </div>
          </div>
          <div className="adl-settings-row__control">
            <span className="adl-opencode-settings__value">
              {source?.system?.path ?? t.opencodeSystemNotDetected}
            </span>
          </div>
        </div>
        <div className="adl-settings-row">
          <div className="adl-settings-row__label">
            <div className="adl-settings-row__label-text">
              <span>{t.opencodeTerminalInjection}</span>
            </div>
          </div>
          <div className="adl-settings-row__control">
            <input
              type="checkbox"
              checked={source?.terminalInjection ?? true}
              disabled={busy || !bridge}
              onChange={(e) =>
                void run(
                  () => bridge!.setTerminalInjection(e.target.checked),
                  t.opencodeTerminalInjectionSaved,
                )
              }
            />
          </div>
        </div>
        <div className="adl-settings-row">
          <div className="adl-settings-row__label">
            <div className="adl-settings-row__label-text">
              <span>{t.opencodeTerminalNote}</span>
            </div>
          </div>
        </div>
      </div>

      {task ? (
        <div className="adl-settings-card">
          <div className="adl-settings-row">
            <div className="adl-settings-row__label">
              <div className="adl-settings-row__label-text">
                <span>{phaseLabel(task.phase)}</span>
              </div>
            </div>
            <div className="adl-settings-row__control">
              <span className="adl-opencode-settings__value">
                {task.percent === null ? '—' : `${task.percent}%`}
              </span>
              {task.cancellable ? (
                <button
                  type="button"
                  className="adl-opencode-settings__action-btn"
                  onClick={() => void bridge?.cancelVersionTask()}
                >
                  {t.opencodeCancel}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="adl-settings-card">
        <div className="adl-settings-row">
          <div className="adl-settings-row__label">
            <div className="adl-settings-row__label-text">
              <span>{t.opencodeResetDefaults}</span>
            </div>
          </div>
          <div className="adl-settings-row__control">
            <button
              type="button"
              className="adl-opencode-settings__action-btn"
              disabled={busy || !bridge || sourceMode === 'auto'}
              onClick={() =>
                void run(() => bridge!.saveVersionSource('auto'), t.settingsResetComplete)
              }
            >
              {t.opencodeResetDefaults}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
