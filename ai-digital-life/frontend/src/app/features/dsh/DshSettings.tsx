import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '@i18n/formatT';
import { useAppStore } from '@stores/slicedStore';
import { useAppActions } from '@hooks/useAppActions';
import { executeDshResetPlan } from '@shared/settings-reset/dshReset';
import { Spinner } from '@components/Spinner';
import { openUrlByMethod } from '@features/preview/openByMethod';
import { anchorFor } from '@components/settings/settingsSearchIndex';
import { SettingsHeader } from '../../components/settings/SettingsHeader';
import { SettingsHintButton } from '../../components/settings/SettingsHintButton';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { HarnessVersionCard } from '../harness/HarnessVersionCard';
import type { HarnessVersionResult } from '../harness/harnessVersionBridge';
import type { DshVersionSourceMode } from '../../../shared/ipc/dsh';
import { createDshVersionBridge } from './dshVersionBridge';
import { DshVersionReadout } from './DshVersionReadout';
import { closeDshTabsByUrl, VERSION_TOAST_MS } from './dshVersionRuntime';

/** 官方信息外链（事项 5）：npm 包页 + GitHub Releases，经 openExternal 双端跳转。 */
const NPM_PACKAGE_URL = 'https://www.npmjs.com/package/@deepseek-ai/dsh';
const GITHUB_RELEASES_URL = 'https://github.com/deepseek-ai/deepseek-harness/releases';

/** 来源切换确认框的冻结上下文（打开时定格，避免切源流程中文案中途翻转）。 */
interface SourceSwitchState {
  mode: DshVersionSourceMode;
  /** 当前来源解析为空（如空宿主）→ 用「从无版本恢复为可用来源」文案。 */
  fromEmpty: boolean;
  /** 目标来源解析为空 → 追加「切换后无版本可用」的后果说明。 */
  targetEmpty: boolean;
}

/**
 * 「DSH」设置组：通用版本卡片（ticket #2 抽取）+ DSH 专属插槽与运行态编排。
 *
 * 卡片只消费 `HarnessVersionBridge`；DSH 的 store/actions 全部在
 * `dshVersionBridge` 适配器里映射。组内保留迁移前的三块固定内容：
 * 1. 块头（`anchorFor('dsh','version')` + 问号 + 版本管理标题）；
 * 2. 「当前下载源」只读摘要卡（`anchorFor('dsh','source')`）；
 * 3. 组级恢复自有流程（版本来源=自动，经共享 `executeDshResetPlan` 一次写入）。
 *
 * 版本来源三态切换的确认对话框、立即/下次启动语义、auto→宿主自动切换与
 * 运行态轮询也由本层拥有——卡片不感知这些 DSH 特有规则。
 */
export function DshSettings() {
  const { t } = useTCopy();
  const actions = useAppActions();
  const sourceStatus = useAppStore((s) => s.sourceStatus);
  const versionStatus = useAppStore((s) => s.versionStatus);
  const setActiveSettingsGroup = useAppStore((s) => s.setActiveSettingsGroup);
  const showToast = useAppStore((s) => s.showToast);
  const setDshBlocksAtDefault = useAppStore((s) => s.setDshBlocksAtDefault);
  const dshGroupResetPending = useAppStore((s) => s.dshGroupResetPending);
  const consumeDshGroupReset = useAppStore((s) => s.consumeDshGroupReset);
  const deferredSource = useAppStore((s) => s.dshVersionSourceDeferred);
  const setDeferredSource = useAppStore((s) => s.setDshVersionSourceDeferred);
  const pendingSource = useAppStore((s) => s.dshVersionSourcePending);
  const setPendingSource = useAppStore((s) => s.setDshVersionSourcePending);
  const dshFastPoll = useAppStore((s) => s.dshRestarting || s.sourceStatus?.starting === true);

  const [groupResetOpen, setGroupResetOpen] = useState(false);
  const [groupResetBusy, setGroupResetBusy] = useState(false);

  // 卸载兜底：pending 置位后若组件在消费前卸载，清信号避免下次挂载"迟到弹窗"。
  // 聚合信号卸载不清（事项 12d）：保留最后已知值供侧边栏禁用判定，
  // 切出后由 SettingsPanel 未激活校正随 store 变化刷新。
  useEffect(
    () => () => {
      useAppStore.getState().consumeDshGroupReset();
    },
    [],
  );

  // 源状态缺失时自行静默拉取（与 NetworkSettings 同法）：直接落到持久化的 DSH 组
  // 时也必须有摘要数据，不假设网络组先访问过；失败保持 null，摘要 fail-open。
  useEffect(() => {
    if (useAppStore.getState().sourceStatus === null) {
      void actions.fetchSourceStatus(true);
    }
  }, [actions]);

  // 轻量运行状态轮询（外部进程无法发事件，只能低频兜底）：只探端口 + 宿主托管/
  // 拉起标志，不跑 where/版本探测；页面隐藏时暂停。拉起中/重启长尾用更密间隔。
  useEffect(() => {
    const tick = () => {
      if (document.hidden) {
        return;
      }
      void actions.fetchDshRunning(true);
    };
    const id = window.setInterval(tick, dshFastPoll ? 1000 : 5000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [actions, dshFastPoll]);

  // 聚合信号：版本来源=自动 → 默认（供侧边栏 DSH 行禁用）。
  // 保留 sourceStatus 门（未知 → false → 侧边栏启用，本来就是 fail-open）。
  const versionSourceAtDefault = (sourceStatus?.config.version_source ?? 'auto') === 'auto';
  useEffect(() => {
    setDshBlocksAtDefault(sourceStatus !== null && versionSourceAtDefault);
  }, [sourceStatus, versionSourceAtDefault, setDshBlocksAtDefault]);

  /**
   * 组级恢复对话框打开（承接 pending 信号）：守卫先行——组框已开/执行中 →
   * 不消费 pending（信号保留，框关闭后 effect 重试），避免重置意图被
   * 静默吞掉（事项 11 Phase 4 A1-L1）。
   */
  const openGroupResetDialog = useCallback(() => {
    if (groupResetOpen || groupResetBusy) {
      return;
    }
    consumeDshGroupReset();
    setGroupResetOpen(true);
  }, [consumeDshGroupReset, groupResetOpen, groupResetBusy]);

  useEffect(() => {
    if (!dshGroupResetPending) {
      return;
    }
    openGroupResetDialog();
  }, [dshGroupResetPending, openGroupResetDialog]);

  /** 组级恢复：版本来源=自动。乐观执行：点确认立刻关框，后台单计划一次写入；
   * 失败则 toast（action 非 silent 已记全局错误卡，此处再补失败提示），无本地回滚
   * （本组无本地表单态，版本块经自身快照刷新）。 */
  const handleGroupConfirm = useCallback(() => {
    if (groupResetBusy) {
      return;
    }
    setGroupResetBusy(true);
    setGroupResetOpen(false);
    void (async () => {
      try {
        // 版本来源与源/代理分属 dsh/network 两共享计划：本组只写版本来源
        // （Task 5 拆分语义；源/代理恢复归网络组）。
        const save = {
          saveSourceConfig: (cfg: Parameters<typeof actions.saveSourceConfig>[0]) =>
            actions.saveSourceConfig(cfg),
        };
        const result = await executeDshResetPlan(save);
        if (!result.ok) {
          showToast(t.dshSettingsSaveFailed, 'error');
          return;
        }
        showToast(t.settingsResetComplete, 'success');
      } finally {
        setGroupResetBusy(false);
      }
    })();
  }, [groupResetBusy, actions, showToast, t]);

  // 取消无执行中守卫：组确认乐观先关框，busy 为 true 时对话框已卸载，
  // 取消按钮物理不可达（事项 11 Phase 4 B1-A-1 死守卫清理）。
  const handleGroupCancel = useCallback(() => {
    setGroupResetOpen(false);
  }, []);

  const groupResetTitle = formatT(t, 'settingsResetGroupConfirmTitle', { group: t.settingsDsh });
  const groupResetMessage = formatT(t, 'settingsResetGroupConfirmMessage', {
    group: t.settingsDsh,
  });

  const handleGoNetwork = useCallback(() => {
    setActiveSettingsGroup('network');
  }, [setActiveSettingsGroup]);

  const rawBridge = typeof window !== 'undefined' ? window.digitalLife?.dsh : undefined;

  const notify = useCallback(
    (message: string, tone: 'success' | 'warning' | 'error') => {
      // 版本四操作成功提示沿用 DSH 的 5s 长展示（默认 3s 用户实测中曾错过）。
      showToast(message, tone, undefined, VERSION_TOAST_MS);
    },
    [showToast],
  );

  /* ---------------- 版本来源三态切换（对话框 + 延迟语义） ---------------- */

  const [sourceSwitch, setSourceSwitch] = useState<SourceSwitchState | null>(null);
  const [sourceSwitchBusy, setSourceSwitchBusy] = useState(false);
  const sourceSwitchResolve = useRef<((result: HarnessVersionResult) => void) | null>(null);
  const sourceSwitchCancelRef = useRef<HTMLButtonElement | null>(null);

  const saveVersionSource = useCallback(
    async (mode: DshVersionSourceMode): Promise<boolean> => {
      const ok = await actions.saveSourceConfig({ version_source: mode }, true);
      if (!ok) {
        showToast(t.dshSettingsSaveFailed, 'error');
        return false;
      }
      // 直接落盘即“本次生效”，清掉可能残留的下次启动 pending（事项 2026-10-20/5）。
      setPendingSource(null);
      setDeferredSource(false);
      await actions.fetchSourceStatus(true);
      return true;
    },
    [actions, setPendingSource, setDeferredSource, showToast, t],
  );

  const finishSourceSwitch = useCallback((result: HarnessVersionResult) => {
    const resolve = sourceSwitchResolve.current;
    sourceSwitchResolve.current = null;
    setSourceSwitch(null);
    setSourceSwitchBusy(false);
    resolve?.(result);
  }, []);

  /**
   * 卡片来源选择器的唯一入口（`capabilities.sourceModeChange === 'deferred'`）：
   * - 切向系统安装但未检测到系统安装 → 错误提示，不弹框、不写盘；
   * - 目标与当前解析一致（auto 落到当前来源、或切到正是真实来源）→ 直接保存；
   * - 解析结果确实不同 → 弹确认框（立即生效 / 下次启动生效 / 取消），
   *   Promise 在用户选择后才 resolve，期间卡片保持忙碌态（与迁移前一样禁用操作）。
   */
  const changeSourceMode = useCallback(
    (mode: DshVersionSourceMode): Promise<HarnessVersionResult> => {
      return (async () => {
        // 决策前现查一次：挂载时的快照在预拉起完成前 `running` 为 null，直接存会
        // 跳过确认对话框（用户实测切源无弹窗即此 stale 快照所致）。现查失败则
        // 沿用 stale 快照继续决策，后续落盘/重启失败自会提示。
        await actions.fetchSourceStatus(true);
        const fresh = useAppStore.getState().sourceStatus;
        const currentMode: DshVersionSourceMode =
          fresh?.versionSource?.mode ?? fresh?.config?.version_source ?? 'auto';
        if (mode === 'system' && !fresh?.system) {
          showToast(t.dshSystemMissing, 'error');
          return { ok: true };
        }
        const currentResolved = fresh?.versionSource?.resolvedByMode?.[currentMode] ?? 'none';
        const targetResolved = fresh?.versionSource?.resolvedByMode?.[mode] ?? 'none';
        if (targetResolved === currentResolved) {
          // 解析结果不变（如 auto→system 而 auto 本就在系统）→ 只更新偏好，不弹框，
          // 可用来源未变、无进程需重启，也不需要关闭任何 dsh 标签。
          const ok = await saveVersionSource(mode);
          return ok ? { ok: true } : { ok: false, silent: true };
        }
        setSourceSwitch({
          mode,
          fromEmpty: currentResolved === 'none',
          targetEmpty: targetResolved === 'none',
        });
        return new Promise<HarnessVersionResult>((resolve) => {
          sourceSwitchResolve.current = resolve;
        });
      })();
    },
    [actions, saveVersionSource, showToast, t],
  );

  /**
   * 确认对话框三选项：
   * · 下次启动生效：只记 pending（localStorage）+ deferred 标记，不写配置；
   * · 立即生效：落盘 + 清 pending + 重启（无 dsh 标签时不自动新建）；
   * · 取消：切向 system 时回退宿主（历史行为），离开 system 时保持 system 不写盘。
   */
  const handleSourceSwitchChoice = useCallback(
    async (choice: 'next' | 'now' | 'cancel') => {
      if (sourceSwitchBusy || !sourceSwitch) {
        return;
      }
      const target = sourceSwitch.mode;
      if (choice === 'cancel') {
        setDeferredSource(false);
        // 当前来源解析为空时，选择器与配置本就未变，再写 host 会静默改配置
        // （如 auto 全空 → 取消后变 host），故该场景取消必须是纯 no-op。
        if (target === 'system' && !sourceSwitch.fromEmpty) {
          await saveVersionSource('host');
        }
        finishSourceSwitch({ ok: true });
        return;
      }
      if (choice === 'next') {
        setPendingSource(target);
        setDeferredSource(true);
        showToast(t.dshVersionSourceNextLaunchSaved, 'success');
        finishSourceSwitch({ ok: true });
        return;
      }
      setSourceSwitchBusy(true);
      try {
        // 切到空来源要关闭已打开的 dsh 标签：重启后 running 归零，提前记下地址。
        // 捕获即剥离 query（一次性 token 不应存入局部变量）。
        const rawPreSwitchUrl =
          useAppStore.getState().sourceStatus?.running?.url ??
          useAppStore.getState().dshLastUrl ??
          null;
        const preSwitchUrl = rawPreSwitchUrl?.split('?')[0] ?? null;
        if (!(await saveVersionSource(target))) {
          finishSourceSwitch({ ok: false, silent: true });
          return;
        }
        // 目标解析为空：重启只会停掉旧进程，标签仍冻结在旧页面 —— 按切换前地址
        // 同源关闭（用户实测 2026-10-22 标签不关）。
        const targetResolved =
          useAppStore.getState().sourceStatus?.versionSource?.resolvedByMode?.[target] ?? 'none';
        const restart = await actions.restartDsh();
        await actions.fetchSourceStatus(true);
        if (targetResolved === 'none') {
          closeDshTabsByUrl(preSwitchUrl);
        }
        showToast(
          restart.failed ? t.dshRestartFailed : t.dshVersionSourceSwitched,
          restart.failed ? 'error' : 'success',
        );
        finishSourceSwitch({ ok: true });
      } finally {
        setSourceSwitchBusy(false);
      }
    },
    [
      actions,
      sourceSwitchBusy,
      sourceSwitch,
      setPendingSource,
      setDeferredSource,
      saveVersionSource,
      showToast,
      t,
      finishSourceSwitch,
    ],
  );

  // Escape 仅关闭对话框，不做任何写入：用户“先不做决定”不应被记为“取消回退 host”。
  useEffect(() => {
    if (!sourceSwitch) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || sourceSwitchBusy) {
        return;
      }
      event.preventDefault();
      finishSourceSwitch({ ok: true });
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sourceSwitch, sourceSwitchBusy, finishSourceSwitch]);

  useEffect(() => {
    if (sourceSwitch) {
      sourceSwitchCancelRef.current?.focus();
    }
  }, [sourceSwitch]);

  /* ---------------- auto → 宿主自动切换（迁移前的兜底） ---------------- */

  const autoSwitchedRef = useRef(false);
  const autoSource = sourceStatus?.versionSource ?? null;
  useEffect(() => {
    if (!autoSource || autoSource.mode !== 'auto') {
      autoSwitchedRef.current = false;
      return;
    }
    if (autoSource.effective !== 'none') {
      return;
    }
    if (!versionStatus || versionStatus.installed.length > 0) {
      return;
    }
    if (autoSwitchedRef.current) {
      return;
    }
    autoSwitchedRef.current = true;
    void (async () => {
      const ok = await actions.saveSourceConfig({ version_source: 'host' }, true);
      if (ok) {
        // 直接落盘即「本次生效」，清掉可能残留的下次启动 pending。
        setPendingSource(null);
        setDeferredSource(false);
      }
    })();
  }, [autoSource, versionStatus, actions, setPendingSource, setDeferredSource]);

  /* ---------------- 通用版本卡片（适配器 + 插槽） ---------------- */

  const bridge = useMemo(
    () =>
      createDshVersionBridge({
        bridge: rawBridge,
        toolName: t.settingsDsh,
        t,
        actions,
        notify,
        changeSourceMode,
      }),
    [rawBridge, t, actions, notify, changeSourceMode],
  );

  const versionSource = sourceStatus?.versionSource ?? null;
  const mode: DshVersionSourceMode =
    versionSource?.mode ?? sourceStatus?.config.version_source ?? 'auto';
  const resolvedSource = versionSource?.resolvedByMode?.[mode] ?? null;
  // 显隐：配置为系统（mode）或偏好解析落在系统（resolvedByMode）或待切换为系统
  // （pending）任一成立即隐藏；defer 期间选择器仍显示当前生效来源，另有提示行说明。
  const systemManaged =
    mode === 'system' || resolvedSource === 'system' || pendingSource === 'system';

  const sourceNote = (
    <>
      <small className="adl-harness-version__note">{t.dshVersionSourceDesc}</small>
      {systemManaged ? (
        <small className="adl-harness-version__note">{t.dshSystemManagedNote}</small>
      ) : null}
      {deferredSource ? (
        <small className="adl-harness-version__note">{t.dshVersionSourceDeferredNote}</small>
      ) : null}
      {!systemManaged && resolvedSource === 'none' ? (
        <small className="adl-harness-version__note">
          {mode === 'host' ? t.dshNoSourceHostNote : t.dshNoSourceAutoNote}
        </small>
      ) : null}
    </>
  );

  const footer = (
    <div className="adl-settings-card">
      <div className="adl-settings-row" data-settings-row={t.dshOfficialLinksLabel}>
        <div className="adl-settings-row__label">
          <div className="adl-settings-row__label-text">
            <span>{t.dshOfficialLinksLabel}</span>
          </div>
          <small>
            {t.dshOfficialLinksDesc}{' '}
            <button
              type="button"
              className="adl-harness-version__inline-link"
              onClick={() => openUrlByMethod(NPM_PACKAGE_URL)}
            >
              {t.dshNpmPage}
            </button>{' '}
            <button
              type="button"
              className="adl-harness-version__inline-link"
              onClick={() => openUrlByMethod(GITHUB_RELEASES_URL)}
            >
              {t.dshGithubReleases}
            </button>
          </small>
        </div>
      </div>
    </div>
  );

  const pendingTargetLabel =
    sourceSwitch?.mode === 'system'
      ? t.dshVersionSourceSystem
      : sourceSwitch?.mode === 'host'
        ? t.dshVersionSourceHost
        : t.dshVersionSourceAuto;

  const summaryLabel = formatT(t, 'dshSourceSummary', {
    title: t.dshSourceSummaryTitle,
    registry: sourceStatus?.config.npm_registry ?? t.dshSourceSummaryUnknown,
  });
  const summaryMode = formatT(t, 'dshSourceSummaryMode', {
    mode:
      sourceStatus?.config.source_mode === 'auto'
        ? t.dshSettingsSourceAuto
        : sourceStatus?.config.source_mode === 'manual'
          ? t.dshSourceSummaryManual
          : t.dshSourceSummaryUnknown,
  });

  // 当前下载源独立沉底卡（无块标题，照抄存储组数据位置索引卡）：
  // 问号在设置项名称文字左边，卡片无主标题，锚点挂卡片，只读 + 前往修改跳转。
  const sourceSummaryCard = (
    <div
      className="adl-settings-card"
      data-testid="dsh-source-summary-card"
      data-settings-anchor={anchorFor('dsh', 'source')}
    >
      <div className="adl-settings-row" data-settings-row={t.dshSourceSummaryTitle}>
        <div className="adl-settings-row__label">
          <div className="adl-settings-row__label-text">
            <SettingsHintButton content={t.dshSourceSummaryHint} />
            <span>{summaryLabel}</span>
            <span className="adl-dsh-settings__source-mode">{summaryMode}</span>
          </div>
        </div>
        <div className="adl-settings-row__control">
          <button type="button" className="adl-dsh-settings__action-btn" onClick={handleGoNetwork}>
            {t.dshSourceSummaryGoModify}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="adl-settings-section adl-dsh-settings">
      <div
        className="adl-dsh-settings__header adl-dsh-settings__header--section"
        data-settings-anchor={anchorFor('dsh', 'version')}
      >
        <SettingsHintButton content={t.dshVersionManagementHint} />
        <SettingsHeader title={t.dshVersionManagement} />
      </div>
      <HarnessVersionCard
        bridge={bridge}
        slots={{
          // 块头复用 DSH 组原有块头（锚点 + 问号 + 版本管理标题）。
          hideHeader: true,
          headerHint: t.dshVersionManagementHint,
          sourceHint: t.dshVersionSourceHint,
          missingBanner: () => (
            <span data-testid="dsh-missing-banner">{t.harnessMissingBannerDsh}</span>
          ),
          sourceNote,
          runtimeReadout: ({ busy }) => <DshVersionReadout busy={busy} />,
          footer,
        }}
      />
      {sourceSummaryCard}

      <ConfirmDialog
        open={groupResetOpen}
        title={groupResetTitle}
        message={groupResetMessage}
        confirmLabel={t.confirm}
        cancelLabel={t.cancel}
        onConfirm={handleGroupConfirm}
        onCancel={handleGroupCancel}
      />

      {sourceSwitch
        ? createPortal(
            <div
              className="adl-confirm-overlay"
              role="dialog"
              aria-modal="true"
              aria-label={
                sourceSwitch.mode === 'system'
                  ? t.dshVersionSourceSystemDialogTitle
                  : t.dshVersionSourceSwitchDialogTitle
              }
              onClick={
                sourceSwitchBusy ? undefined : () => finishSourceSwitch({ ok: true })
              }
            >
              <div className="adl-confirm-dialog" onClick={(event) => event.stopPropagation()}>
                <div className="adl-confirm-dialog__header">
                  <h3 className="adl-confirm-dialog__title">
                    {sourceSwitch.mode === 'system'
                      ? t.dshVersionSourceSystemDialogTitle
                      : t.dshVersionSourceSwitchDialogTitle}
                  </h3>
                </div>
                <div className="adl-confirm-dialog__body">
                  <p className="adl-confirm-dialog__message adl-harness-version__dialog-message">
                    {sourceSwitch.fromEmpty
                      ? t.dshVersionSourceSwitchDialogFromEmpty.replaceAll(
                          '{target}',
                          pendingTargetLabel,
                        )
                      : sourceSwitch.mode === 'system'
                        ? t.dshVersionSourceSystemDialogMessage.replace(
                            '{path}',
                            sourceStatus?.system?.path ?? '',
                          )
                        : t.dshVersionSourceSwitchDialogMessage.replaceAll(
                            '{target}',
                            pendingTargetLabel,
                          )}
                  </p>
                  {sourceSwitch.targetEmpty ? (
                    <p className="adl-confirm-dialog__message adl-harness-version__dialog-message">
                      {t.dshVersionSourceSwitchDialogEmpty.replaceAll(
                        '{target}',
                        pendingTargetLabel,
                      )}
                    </p>
                  ) : null}
                </div>
                <div className="adl-confirm-dialog__footer">
                  <button
                    ref={sourceSwitchCancelRef}
                    type="button"
                    className="adl-btn adl-btn--secondary"
                    disabled={sourceSwitchBusy}
                    onClick={() => void handleSourceSwitchChoice('cancel')}
                  >
                    {t.cancel}
                  </button>
                  {/* 次选项为同步记 pending（无异步过程），busy 仅禁用不转圈：
                      圈只属于真正走异步重启的“立即生效”。 */}
                  <button
                    type="button"
                    className="adl-btn adl-btn--secondary"
                    disabled={sourceSwitchBusy}
                    onClick={() => void handleSourceSwitchChoice('next')}
                  >
                    {t.dshVersionSourceApplyNextLaunch}
                  </button>
                  <button
                    type="button"
                    className="adl-btn adl-btn--secondary"
                    disabled={sourceSwitchBusy}
                    onClick={() => void handleSourceSwitchChoice('now')}
                    aria-label={sourceSwitchBusy ? t.dshVersionSourceApplyNow : undefined}
                  >
                    {sourceSwitchBusy ? (
                      <Spinner size="sm" speed="normal" />
                    ) : (
                      t.dshVersionSourceApplyNow
                    )}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
