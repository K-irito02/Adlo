import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '@i18n/formatT';
import { useAppStore } from '@stores/slicedStore';
import { useAppActions } from '@hooks/useAppActions';
import { detectFastestSource } from '../network/sourceAutoDetect';
import { SettingsHeader } from '../../components/settings/SettingsHeader';
import { SettingsHintButton } from '../../components/settings/SettingsHintButton';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Spinner } from '@components/Spinner';
import { IconRefreshCw } from '../../icons';
import { openUrlByMethod } from '@features/preview/openByMethod';
import { executeOpencodeResetPlan } from '@shared/settings-reset/opencodeReset';
import {
  getCachedOpencodeSnapshot,
  getPersistedOpencodeSourceMode,
  setCachedOpencodeSnapshot,
} from './opencodeStatusCache';
import { anchorFor } from '@components/settings/settingsSearchIndex';
import type {
  DshVersionCatalog,
  DshVersionSourceMode,
  DshVersionStatus,
  DshVersionTask,
  IpcResult,
  OpencodeSourceStatus,
} from '../../../shared/ipc';

const EMPTY_STABLE: DshVersionCatalog['stable'] = [];

/** 官方信息外链：npm 包页 + GitHub Releases，经 openExternal 双端跳转（与 DSH 组同构）。 */
const NPM_PACKAGE_URL = 'https://www.npmjs.com/package/opencode-ai';
const GITHUB_RELEASES_URL = 'https://github.com/anomalyco/opencode/releases';

/**
 * 「OpenCode CLI」设置组：版本管理 + 版本来源 + 终端可用性说明。
 *
 * 与 DSH 组共享同一套后端版本内核（`adl_harness_version`），但没有运行态
 * （无端口/标签/auth）；安装产物是自包含 exe，终端 PATH 注入由服务端在
 * 新会话创建时完成。
 *
 * 结构与 DSH 组对齐：首卡为版本块（版本来源/当前版本/检查更新/正式版本/
 * 预发布版本/指定版本/官方版本信息），检查更新/正式版/预发布版/指定版本仅在
 * `manageVisible` 时渲染（系统安装时隐藏）；第二卡为已装版本列表；
 * 第三个独立小卡为当前下载源（只读 + 前往网络组修改）；末卡为终端可用开关。
 * 数据走模块级会话缓存（`opencodeStatusCache`，stale-while-revalidate）：
 * 切组重挂即瞬显，首访（缓存空）才画骨架，骨架形状按关组前的版本来源定形。
 */
export function OpencodeSettings() {
  const { t } = useTCopy();
  const showToast = useAppStore((s) => s.showToast);
  const setActiveSettingsGroup = useAppStore((s) => s.setActiveSettingsGroup);
  const networkSourceStatus = useAppStore((s) => s.sourceStatus);
  const opencodeGroupResetPending = useAppStore((s) => s.opencodeGroupResetPending);
  const consumeOpencodeGroupReset = useAppStore((s) => s.consumeOpencodeGroupReset);
  const setOpencodeBlocksAtDefault = useAppStore((s) => s.setOpencodeBlocksAtDefault);
  const actions = useAppActions();
  const bridge = typeof window !== 'undefined' ? window.digitalLife?.opencode : undefined;

  const cached = getCachedOpencodeSnapshot();
  const [status, setStatus] = useState<DshVersionStatus | null>(cached?.status ?? null);
  const [catalog, setCatalog] = useState<DshVersionCatalog | null>(cached?.catalog ?? null);
  const [source, setSource] = useState<OpencodeSourceStatus | null>(cached?.source ?? null);
  const [task, setTask] = useState<DshVersionTask | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [statusRefreshing, setStatusRefreshing] = useState(false);
  const [catalogRefreshing, setCatalogRefreshing] = useState(false);
  const [stablePick, setStablePick] = useState('');
  const [manual, setManual] = useState('');
  const [groupResetOpen, setGroupResetOpen] = useState(false);
  const [groupResetBusy, setGroupResetBusy] = useState(false);

  // 快照写回（会话持久化）：任一腿到货即合并写缓存，供下次进组瞬显；
  // 来源偏好一并落 localStorage，供首帧骨架定形。
  useEffect(() => {
    if (status !== null || catalog !== null || source !== null) {
      setCachedOpencodeSnapshot({ status, catalog, source });
    }
  }, [status, catalog, source]);

  // 聚合信号：版本来源=自动 + 终端默认启用 → 默认（供侧边栏行禁用；未知保持启用 fail-open）。
  const versionSourceAtDefault =
    source !== null && source.versionSource.mode === 'auto' && source.terminalInjection === true;
  useEffect(() => {
    setOpencodeBlocksAtDefault(source !== null ? versionSourceAtDefault : null);
  }, [source, versionSourceAtDefault, setOpencodeBlocksAtDefault]);

  const refreshStatus = useCallback(async (): Promise<boolean> => {
    if (!bridge) {
      return false;
    }
    setStatusRefreshing(true);
    try {
      const s = await bridge.getVersionStatus();
      if (s.ok) {
        setStatus(s.data);
        setStablePick((prev) => prev || s.data.currentSelected || s.data.latestAvailable || '');
        return true;
      }
      return false;
    } finally {
      setStatusRefreshing(false);
    }
  }, [bridge]);

  const refreshCatalog = useCallback(async (): Promise<boolean> => {
    if (!bridge) {
      return false;
    }
    setCatalogRefreshing(true);
    try {
      const c = await bridge.getVersionCatalog();
      if (c.ok) {
        setCatalog(c.data);
        return true;
      }
      return false;
    } finally {
      setCatalogRefreshing(false);
    }
  }, [bridge]);

  // 首帧（含后台静默再验证）：挂载即三腿并发；命中缓存时同样再验证，
  // 保持与 DSH 组一致的“启动后自动检查一次、静默无 toast”语义。
  const refreshAll = useCallback(async () => {
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
    void refreshAll();
  }, [refreshAll]);

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
        await refreshAll();
      }
    },
    [bridge, refreshAll, showToast, t],
  );

  const stable = catalog?.stable ?? EMPTY_STABLE;
  const latestPrerelease = catalog?.prerelease[0] ?? null;
  const current = status?.currentSelected ?? null;
  const installed = status?.installed ?? [];
  const sourceMode: DshVersionSourceMode = source?.versionSource.mode ?? 'auto';
  const effective = source?.versionSource.effective ?? 'none';
  // 显隐（与 DSH `manageVisible` 同语义）：偏好或偏好解析落到系统安装即隐藏管理项。
  const modeIsSystem = sourceMode === 'system';
  const resolvedSource = source?.versionSource.resolvedByMode?.[sourceMode] ?? null;
  const sourceReady = source !== null;
  const systemManaged = modeIsSystem || resolvedSource === 'system';
  const manageVisible = sourceReady && !systemManaged;
  // 首帧骨架：仅缓存全空（应用启动后首次进组）时画；形状按关组前的版本来源定形。
  const showSkeleton = status === null && source === null;
  const skeletonManaged = getPersistedOpencodeSourceMode() !== 'system';

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

  // 检查更新（仅检查，不升级）：结果走 toast，与 DSH 组同口径；
  // 蓝色新版本提示由当前版本行按 status 派生，无需此处另设状态。
  const handleCheckUpdate = useCallback(async () => {
    if (!bridge || checkingUpdate || busy) {
      return;
    }
    setCheckingUpdate(true);
    try {
      const [s, c] = await Promise.all([bridge.getVersionStatus(), bridge.getVersionCatalog()]);
      if (s.ok) {
        setStatus(s.data);
      }
      if (c.ok) {
        setCatalog(c.data);
      }
      const next = s.ok ? s.data : status;
      if (!next?.latestAvailable) {
        if (next?.hasPrereleaseUpdate && next.prereleaseAvailable) {
          showToast(
            t.opencodeCheckUpdatePrerelease.replace('{version}', next.prereleaseAvailable),
            'success',
          );
        } else {
          showToast(t.opencodeCheckUpdateNoStable, 'warning');
        }
        return;
      }
      if (next.hasUpdate) {
        showToast(t.opencodeCheckUpdateFound.replace('{version}', next.latestAvailable), 'success');
      } else {
        showToast(t.opencodeNoUpdate, 'success');
      }
    } catch {
      showToast(t.opencodeCheckUpdateFailed, 'error');
    } finally {
      setCheckingUpdate(false);
    }
  }, [bridge, busy, checkingUpdate, showToast, status, t]);

  const handleOpenOfficial = useCallback((url: string) => {
    openUrlByMethod(url);
  }, []);

  const handleGoNetwork = useCallback(() => {
    setActiveSettingsGroup('network');
  }, [setActiveSettingsGroup]);

  const setTerminalInjection = useCallback(
    (enabled: boolean) => {
      if (!bridge) {
        return;
      }
      void run(() => bridge.setTerminalInjection(enabled), t.opencodeTerminalInjectionSaved);
    },
    [bridge, run, t],
  );

  // ── 组级恢复（侧边栏「恢复 OpenCode CLI 全部默认」）：pending 消费 + 确认框 + 单计划 ──
  useEffect(
    () => () => {
      useAppStore.getState().consumeOpencodeGroupReset();
    },
    [],
  );

  const openGroupResetDialog = useCallback(() => {
    if (groupResetOpen || groupResetBusy) {
      return;
    }
    consumeOpencodeGroupReset();
    setGroupResetOpen(true);
  }, [consumeOpencodeGroupReset, groupResetOpen, groupResetBusy]);

  useEffect(() => {
    if (!opencodeGroupResetPending) {
      return;
    }
    openGroupResetDialog();
  }, [opencodeGroupResetPending, openGroupResetDialog]);

  const handleGroupConfirm = useCallback(() => {
    if (groupResetBusy) {
      return;
    }
    if (!bridge) {
      setGroupResetOpen(false);
      showToast(t.opencodeOpFailed, 'error');
      return;
    }
    setGroupResetBusy(true);
    setGroupResetOpen(false);
    void (async () => {
      try {
        const result = await executeOpencodeResetPlan({
          saveVersionSource: async (mode) => (await bridge.saveVersionSource(mode)).ok,
          setTerminalInjection: async (enabled) => (await bridge.setTerminalInjection(enabled)).ok,
        });
        if (!result.ok) {
          showToast(t.opencodeOpFailed, 'error');
          return;
        }
        showToast(t.settingsResetComplete, 'success');
        await refreshAll();
      } finally {
        setGroupResetBusy(false);
      }
    })();
  }, [groupResetBusy, bridge, refreshAll, showToast, t]);

  const handleGroupCancel = useCallback(() => {
    setGroupResetOpen(false);
  }, []);

  const groupResetTitle = formatT(t, 'settingsResetGroupConfirmTitle', {
    group: t.settingsOpencode,
  });
  const groupResetMessage = formatT(t, 'settingsResetGroupConfirmMessage', {
    group: t.settingsOpencode,
  });

  // 当前下载源独立沉底卡（与 DSH 组同构：问号在名称左边，无块标题，只读 + 前往修改）。
  const networkSourceMode = networkSourceStatus?.config.source_mode;
  const summaryLabel = formatT(t, 'dshSourceSummary', {
    title: t.opencodeSourceSummaryTitle,
    registry: networkSourceStatus?.config.npm_registry ?? t.dshSourceSummaryUnknown,
  });
  const summaryMode = formatT(t, 'dshSourceSummaryMode', {
    mode:
      networkSourceMode === 'auto'
        ? t.dshSettingsSourceAuto
        : networkSourceMode === 'manual'
          ? t.dshSourceSummaryManual
          : t.dshSourceSummaryUnknown,
  });
  const sourceSummaryCard = (
    <div
      className="adl-settings-card"
      data-testid="opencode-source-summary-card"
      data-settings-anchor={anchorFor('opencode', 'source')}
    >
      <div className="adl-settings-row" data-settings-row={t.opencodeSourceSummaryTitle}>
        <div className="adl-settings-row__label">
          <div className="adl-settings-row__label-text">
            <SettingsHintButton content={t.opencodeSourceSummaryHint} />
            <span>{summaryLabel}</span>
            <span className="adl-opencode-settings__hint">{summaryMode}</span>
          </div>
        </div>
        <div className="adl-settings-row__control">
          <button
            type="button"
            className="adl-opencode-settings__action-btn"
            onClick={handleGoNetwork}
          >
            {t.opencodeSourceSummaryGoModify}
          </button>
        </div>
      </div>
    </div>
  );

  const refreshButton = (label: string, onRefresh: () => void, refreshing: boolean) => (
    <button
      type="button"
      className="adl-opencode-settings__refresh-btn"
      title={t.opencodeRefreshRow}
      aria-label={`${t.opencodeRefreshRow}：${label}`}
      disabled={busy || checkingUpdate || refreshing || !bridge}
      onClick={onRefresh}
    >
      <IconRefreshCw size={14} decorative className={refreshing ? 'adl-spin' : undefined} />
    </button>
  );

  const skeletonCard = (
    <div className="adl-settings-card" aria-label={t.opencodeVersionStateReading}>
      {[
        t.opencodeSourceTitle,
        t.opencodeCurrentVersion,
        ...(skeletonManaged ? [t.opencodeUpdate, t.opencodeStable, t.opencodePrerelease] : []),
        t.opencodeOfficialLinksLabel,
      ].map((label) => (
        <div className="adl-settings-row" key={label}>
          <div className="adl-settings-row__label">
            <span className="adl-opencode-settings__skeleton-bar" aria-hidden="true" />
          </div>
          <div className="adl-settings-row__control">
            <span className="adl-opencode-settings__skeleton-control" aria-hidden="true" />
          </div>
        </div>
      ))}
    </div>
  );

  const versionCard = (
    <div className="adl-settings-card">
      {/* 行0：版本来源 */}
      <div className="adl-settings-row" data-settings-row={t.opencodeSourceTitle}>
        <div className="adl-settings-row__label">
          <div className="adl-settings-row__label-text">
            <SettingsHintButton content={t.opencodeSourceHint} />
            <span>{t.opencodeSourceTitle}</span>
          </div>
          <small>{t.opencodeSourceDesc}</small>
          {systemManaged ? (
            <small className="adl-opencode-settings__row-note">{t.opencodeSystemManagedNote}</small>
          ) : null}
          {!systemManaged && resolvedSource === 'none' ? (
            <small className="adl-opencode-settings__row-note">
              {sourceMode === 'host' ? t.opencodeNoSourceHostNote : t.opencodeNoSourceAutoNote}
            </small>
          ) : null}
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

      {/* 行1：当前版本 */}
      <div className="adl-settings-row" data-settings-row={t.opencodeCurrentVersion}>
        <div className="adl-settings-row__label">
          <div className="adl-settings-row__label-text">
            {refreshButton(t.opencodeCurrentVersion, () => void refreshStatus(), statusRefreshing)}
            <SettingsHintButton content={t.opencodeCurrentVersionHint} />
            <span>{t.opencodeCurrentVersion}</span>
          </div>
          <small>{t.opencodeCurrentVersionDesc}</small>
          {manageVisible && status?.hasUpdate && status.latestAvailable ? (
            <small className="adl-opencode-settings__row-note">
              {t.opencodeCheckUpdateFound.replace('{version}', status.latestAvailable)}
            </small>
          ) : null}
          {manageVisible && status?.hasPrereleaseUpdate && status.prereleaseAvailable ? (
            <small className="adl-opencode-settings__row-note">
              {t.opencodeCheckUpdatePrerelease.replace('{version}', status.prereleaseAvailable)}
            </small>
          ) : null}
        </div>
        <div className="adl-settings-row__control">
          {statusRefreshing && status !== null ? (
            <span
              className="adl-opencode-settings__loading"
              role="status"
              aria-label={t.opencodeVersionStateReading}
            />
          ) : (
            <>
              <span className="adl-opencode-settings__value">
                {current ?? t.opencodeNotInstalled}
              </span>
              {current ? (
                <span className="adl-opencode-settings__hint">
                  {t.opencodeSourceEffective}: {effectiveLabel}
                </span>
              ) : null}
            </>
          )}
        </div>
      </div>

      {status !== null && installed.length === 0 && manageVisible ? (
        <div className="adl-settings-row">
          <div className="adl-settings-row__label">
            <div className="adl-settings-row__label-text">
              <span className="adl-opencode-settings__hint">{t.harnessMissingBannerOpencode}</span>
            </div>
          </div>
        </div>
      ) : null}

      {/* 行2：检查更新（仅检查，不升级） */}
      {manageVisible ? (
        <div className="adl-settings-row" data-settings-row={t.opencodeUpdate}>
          <div className="adl-settings-row__label">
            <div className="adl-settings-row__label-text">
              {refreshButton(t.opencodeUpdate, () => void handleCheckUpdate(), checkingUpdate)}
              <SettingsHintButton content={t.opencodeUpdateHint} />
              <span>{t.opencodeUpdate}</span>
            </div>
            <small>{t.opencodeUpdateDesc}</small>
          </div>
          <div className="adl-settings-row__control">
            <button
              type="button"
              className="adl-opencode-settings__action-btn"
              disabled={busy || checkingUpdate || !bridge}
              onClick={() => void handleCheckUpdate()}
              aria-label={checkingUpdate ? t.opencodeUpdate : undefined}
            >
              {checkingUpdate ? <Spinner size="sm" speed="normal" /> : t.opencodeCheckUpdate}
            </button>
          </div>
        </div>
      ) : null}

      {/* 行3：正式版本 */}
      {manageVisible ? (
        <div className="adl-settings-row" data-settings-row={t.opencodeStable}>
          <div className="adl-settings-row__label">
            <div className="adl-settings-row__label-text">
              {refreshButton(t.opencodeStable, () => void refreshCatalog(), catalogRefreshing)}
              <SettingsHintButton content={t.opencodeStableHint} />
              <span>{t.opencodeStable}</span>
            </div>
            <small>{t.opencodeStableDesc}</small>
          </div>
          <div className="adl-settings-row__control">
            {catalogRefreshing && catalog !== null ? (
              <span
                className="adl-opencode-settings__loading"
                role="status"
                aria-label={t.opencodeVersionStateReading}
              />
            ) : stable.length > 0 ? (
              <>
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
              </>
            ) : (
              <span className="adl-opencode-settings__value is-empty">
                {catalog === null ? t.opencodeVersionListUnknown : t.opencodeOfficialStableEmpty}
              </span>
            )}
          </div>
        </div>
      ) : null}

      {/* 行4：预发布版本 */}
      {manageVisible ? (
        <div className="adl-settings-row" data-settings-row={t.opencodePrerelease}>
          <div className="adl-settings-row__label">
            <div className="adl-settings-row__label-text">
              {refreshButton(t.opencodePrerelease, () => void refreshCatalog(), catalogRefreshing)}
              <SettingsHintButton content={t.opencodePrereleaseHint} />
              <span>{t.opencodePrerelease}</span>
            </div>
            <small>{t.opencodePrereleaseDesc}</small>
          </div>
          <div className="adl-settings-row__control">
            {catalogRefreshing && catalog !== null ? (
              <span
                className="adl-opencode-settings__loading"
                role="status"
                aria-label={t.opencodeVersionStateReading}
              />
            ) : latestPrerelease ? (
              <>
                <span className="adl-opencode-settings__value">{latestPrerelease.version}</span>
                <button
                  type="button"
                  className="adl-opencode-settings__action-btn"
                  disabled={busy || !bridge}
                  onClick={() => installVersion(latestPrerelease.version)}
                >
                  {t.opencodeInstall}
                </button>
              </>
            ) : (
              <span className="adl-opencode-settings__value is-empty">
                {catalog === null
                  ? t.opencodeVersionListUnknown
                  : t.opencodeOfficialPrereleaseEmpty}
              </span>
            )}
          </div>
        </div>
      ) : null}

      {/* 行5：指定版本 */}
      {manageVisible ? (
        <div className="adl-settings-row" data-settings-row={t.opencodeManualVersion}>
          <div className="adl-settings-row__label">
            <div className="adl-settings-row__label-text">
              <SettingsHintButton content={t.opencodeManualVersionHint} />
              <span>{t.opencodeManualVersion}</span>
            </div>
            <small>{t.opencodeManualVersionDesc}</small>
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
      ) : null}

      {/* 行6：官方版本信息 */}
      <div className="adl-settings-row" data-settings-row={t.opencodeOfficialLinksLabel}>
        <div className="adl-settings-row__label">
          <div className="adl-settings-row__label-text">
            <span>{t.opencodeOfficialLinksLabel}</span>
          </div>
          <small>
            {t.opencodeOfficialLinksDesc}{' '}
            <button
              type="button"
              className="adl-opencode-settings__inline-link"
              onClick={() => handleOpenOfficial(NPM_PACKAGE_URL)}
            >
              {t.opencodeNpmPage}
            </button>{' '}
            <button
              type="button"
              className="adl-opencode-settings__inline-link"
              onClick={() => handleOpenOfficial(GITHUB_RELEASES_URL)}
            >
              {t.opencodeGithubReleases}
            </button>
          </small>
        </div>
      </div>
    </div>
  );

  return (
    <div className="adl-settings-section adl-opencode-settings">
      <div
        className="adl-settings-storage__header adl-settings-storage__header--section"
        data-settings-anchor={anchorFor('opencode', 'version')}
      >
        <SettingsHintButton content={t.opencodeVersionHint} />
        <SettingsHeader title={t.opencodeVersionTitle} />
      </div>

      {showSkeleton ? skeletonCard : versionCard}

      {manageVisible && installed.length > 0 ? (
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
        <div className="adl-settings-row" data-settings-row={t.opencodeSystemPath}>
          <div className="adl-settings-row__label">
            <div className="adl-settings-row__label-text">
              <SettingsHintButton content={t.opencodeSystemPathHint} />
              <span>{t.opencodeSystemPath}</span>
            </div>
            <small>{t.opencodeSystemPathDesc}</small>
          </div>
          <div className="adl-settings-row__control">
            <span className="adl-opencode-settings__value">
              {source?.system?.path ?? t.opencodeSystemNotDetected}
            </span>
            {source?.system?.path ? (
              <span className="adl-opencode-settings__hint">
                {source.system.version ?? t.opencodeSystemVersionUnknown}
              </span>
            ) : null}
          </div>
        </div>
        <div className="adl-settings-row" data-settings-row={t.opencodeTerminalInjection}>
          <div className="adl-settings-row__label">
            <div className="adl-settings-row__label-text">
              <SettingsHintButton content={t.opencodeTerminalInjectionHint} />
              <span>{t.opencodeTerminalInjection}</span>
            </div>
            <small>{t.opencodeTerminalNote}</small>
          </div>
          <div className="adl-settings-row__control">
            <button
              type="button"
              role="switch"
              aria-checked={source?.terminalInjection ?? true}
              aria-label={t.opencodeTerminalInjection}
              disabled={busy || !bridge}
              className={`adl-settings-toggle${(source?.terminalInjection ?? true) ? ' is-on' : ''}`}
              onClick={() => setTerminalInjection(!(source?.terminalInjection ?? true))}
            >
              <span className="adl-settings-toggle__track">
                <span className="adl-settings-toggle__thumb" />
              </span>
            </button>
          </div>
        </div>
      </div>

      {sourceSummaryCard}

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

      <ConfirmDialog
        open={groupResetOpen}
        title={groupResetTitle}
        message={groupResetMessage}
        confirmLabel={t.confirm}
        cancelLabel={t.cancel}
        onConfirm={handleGroupConfirm}
        onCancel={handleGroupCancel}
      />
    </div>
  );
}
