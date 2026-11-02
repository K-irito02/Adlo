/* eslint-disable react-refresh/only-export-components */
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '@i18n/formatT';
import { useAppStore } from '@stores/slicedStore';
import { useAppActions } from '@hooks/useAppActions';
import { openUrlByMethod } from '@features/preview/openByMethod';
import {
  FlashIcon,
  flashPhaseFor,
  useActionFlash,
  type ActionPhase,
} from '@components/settings/actionFlash';
import { SettingsHeader } from '@components/settings/SettingsHeader';
import { SettingsHintButton } from '@components/settings/SettingsHintButton';
import { SettingsRefreshButton } from '@components/settings/SettingsRefreshButton';
import { ConfirmDialog } from '@components/ConfirmDialog';
import { anchorFor } from '@components/settings/settingsSearchIndex';
import {
  EnvDepRow,
  OPERABLE_DEPS,
  isEnvDepReady,
  type EnvDepKey,
  type EnvDepRowActions,
} from './EnvDepRow';
import { getCachedEnvStatus, isWellFormedEnvStatus, setCachedEnvStatus } from './envStatusCache';
import { envDepLabel } from './depLabels';
import { buildAgentDiagnostic } from './diagnostic';
import type { EnvSourceMode, EnvStatus } from '../../../shared/ipc/env';

/**
 * 依赖行分块（与网络/DSH 组的「块头 + 卡片」同构，用户 2026-10-25 要求对齐）：
 * 基础依赖（可切来源/装宿主版）→ 系统组件（只读检测）。
 * 「网络与模型」块已删除：下载连通归网络组，凭据/模型归 dsh 侧（宿主只管版本管理）。
 */
const DEP_BLOCKS: {
  titleKey: 'environmentBlockRuntime' | 'environmentBlockSystem';
  deps: EnvDepKey[];
}[] = [
  { titleKey: 'environmentBlockRuntime', deps: ['node', 'git', 'bash'] },
  { titleKey: 'environmentBlockSystem', deps: ['webview2', 'adlserver'] },
];

/**
 * 聚合条就绪计数分母：5 个 version 信号（node/git/bash/webview2/adlserver
 * meetsBaseline）= 5。下载连通与模型引导不计入（分属网络组 / dsh 侧）。
 */
export const ENV_READY_TOTAL = 5;

/** 就绪项计数（聚合条与向导完成步/跳过横幅共用同一口径）。 */
export function countEnvReadyDeps(status: EnvStatus): number {
  return (['node', 'git', 'bash', 'webview2', 'adlserver'] as const).filter((dep) =>
    isEnvDepReady(status[dep]),
  ).length;
}

function writeTextFallback(text: string): boolean {
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    const copied =
      typeof document.execCommand === 'function' ? document.execCommand('copy') : false;
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

export function copyTextToClipboard(text: string): Promise<boolean> {
  // 照抄 CopyButton 双通道：clipboard API 优先，失败/缺失降级 execCommand。
  if (navigator.clipboard?.writeText !== undefined) {
    return navigator.clipboard
      .writeText(text)
      .then(() => true)
      .catch(() => writeTextFallback(text));
  }
  return Promise.resolve(writeTextFallback(text));
}

/**
 * 「环境」设置组（Task 7 实装：七依赖行 + 顶部聚合条 + 组级重置自助流）。
 *
 * - 挂载即拉取全量状态（非静默：首屏 loading + 失败错误卡）；命中进场缓存时先瞬显
 *   快照，后台再验证（照抄 storage-settings 方案 B，写回点唯一在此处）。
 * - 安装任务进行中才轮询（`pollEnvTaskWhileRunning`，挂载启动 + 卸载清理，
 *   install 成功后 action 侧另行启动）。
 * - 组级重置仅侧边栏自助（不进 ResetAll 自动序列）：来源全回自动 + 清空指定路径，
 *   不卸载已装版本（spec §7.2）。
 */
export function EnvironmentSettings() {
  const { t, locale } = useTCopy();
  const actions = useAppActions();
  const isTauri = useAppStore((s) => s.isTauri);
  const appInfo = useAppStore((s) => s.appInfo);
  const showToast = useAppStore((s) => s.showToast);
  const setActiveSettingsGroup = useAppStore((s) => s.setActiveSettingsGroup);
  const envWizardSkippedAt = useAppStore((s) => s.envWizardSkippedAt);
  const requestEnvWizard = useAppStore((s) => s.requestEnvWizard);
  const environmentGroupResetPending = useAppStore((s) => s.environmentGroupResetPending);
  const consumeEnvironmentGroupReset = useAppStore((s) => s.consumeEnvironmentGroupReset);

  const [cachedStatus] = useState<EnvStatus | null>(() => getCachedEnvStatus());
  const storeStatus = useAppStore((s) => s.envStatus);
  const status = storeStatus ?? cachedStatus;

  const [installConfirmDep, setInstallConfirmDep] = useState<string | null>(null);
  const [groupResetOpen, setGroupResetOpen] = useState(false);
  const [groupResetBusy, setGroupResetBusy] = useState(false);
  // 行级 / 块级刷新的在途标记：只驱动对应的图标，不消费全局 envBusy。
  // 行用计数：同一 dep 可能同时被「行刷新」与「块刷新」排队覆盖，先完成的
  // 那一路不能提前熄灭另一路还在跑的 spinner。
  const [refreshingRows, setRefreshingRows] = useState<Record<string, number>>({});
  const [refreshingBlocks, setRefreshingBlocks] = useState<Record<string, boolean>>({});
  // 重检串行队列：允许连续点多个块/行（各自转圈），但不并发探测、不静默丢弃。
  const envRefreshChainRef = useRef<Promise<void>>(Promise.resolve());
  const enqueueEnvRefresh = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const run = envRefreshChainRef.current.then(() => task());
    envRefreshChainRef.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }, []);

  /**
   * 按 dep 集合刷新（块级传块标题 key，行级传 null）。
   * 后端只探测传入的依赖；「基础依赖」与「系统组件」因此互不联动。
   */
  const refreshDeps = useCallback(
    async (blockKey: string | null, deps: string[]) => {
      if (deps.length === 0) {
        return;
      }
      setRefreshingRows((prev) => {
        const next = { ...prev };
        deps.forEach((dep) => {
          next[dep] = (next[dep] ?? 0) + 1;
        });
        return next;
      });
      if (blockKey !== null) {
        setRefreshingBlocks((prev) => ({ ...prev, [blockKey]: true }));
      }
      try {
        await enqueueEnvRefresh(() => actions.recheckEnv(deps));
      } finally {
        setRefreshingRows((prev) => {
          const next = { ...prev };
          deps.forEach((dep) => {
            const remaining = (next[dep] ?? 0) - 1;
            if (remaining > 0) {
              next[dep] = remaining;
            } else {
              delete next[dep];
            }
          });
          return next;
        });
        if (blockKey !== null) {
          setRefreshingBlocks((prev) => {
            const next = { ...prev };
            delete next[blockKey];
            return next;
          });
        }
      }
    },
    [actions, enqueueEnvRefresh],
  );
  // 细粒度操作态（事项 1/1c）：聚合条「重新检测 / 复制全部」与空态重试各锁自身，
  // 不再消费全局 envBusy，避免无关联行变灰与禁用。store 的 envBusy 仍保留供
  // 轮询与向导读取，此处仅不再用它做全组 disabled 门控。
  // 三态：loading（圆圈）→ success（打勾）/ error（打叉）回显后自动复位。
  // 各键独立槽位（R1-ENV-01）：聚合三按钮可并发，互不覆盖对方视觉态。
  const { phases, run } = useActionFlash();

  useEffect(() => {
    let cancelled = false;
    // 先等首屏拉取落 store，再按「是否有进行中任务/操作」决定是否起轮询：
    // 避免用旧快照误判（N-02），也避免空闲挂载多打一次全量检测（N-03）。
    void actions.fetchEnvStatus().then(() => {
      if (cancelled) {
        return;
      }
      const { envStatus, envBusy } = useAppStore.getState();
      if (envBusy || (envStatus?.task ?? null) !== null) {
        actions.pollEnvTaskWhileRunning();
      }
    });
    // 轮询归 store 所有：本组件只是启动者/查看者，卸载不得清除共享轮询；
    // 任务终态（task 变 null / error / 持续失败熔断）由轮询自身收尾。
    return () => {
      cancelled = true;
    };
  }, [actions]);

  // 缓存写回唯一点：成功渲染的快照才入缓存（失败/畸形不入，见 envStatusCache）。
  useEffect(() => {
    if (storeStatus !== null && isWellFormedEnvStatus(storeStatus)) {
      setCachedEnvStatus(storeStatus);
    }
  }, [storeStatus]);

  /**
   * 组级恢复对话框打开（承接 pending 信号）：守卫先行——组框已开/
   * 执行中 → 不消费 pending（信号保留，框关闭后 effect 重试），避免重置意图被
   * 静默吞掉（照抄 NetworkSettings 事项 11 Phase 4 A1-L1）。
   * 块级/行级恢复已删除（问号替代），此处仅剩组级。
   */
  const openGroupResetDialog = useCallback(() => {
    if (groupResetOpen || groupResetBusy || installConfirmDep !== null) {
      return;
    }
    consumeEnvironmentGroupReset();
    setGroupResetOpen(true);
  }, [consumeEnvironmentGroupReset, groupResetOpen, groupResetBusy, installConfirmDep]);

  useEffect(() => {
    if (!environmentGroupResetPending) {
      return;
    }
    openGroupResetDialog();
  }, [environmentGroupResetPending, openGroupResetDialog]);

  // 卸载兜底：pending 置位后若组件在消费前卸载，清信号避免下次挂载"迟到弹窗"。
  useEffect(
    () => () => {
      useAppStore.getState().consumeEnvironmentGroupReset();
    },
    [],
  );

  const copyForAgent = useCallback(
    async (dep: EnvDepKey | 'all'): Promise<boolean> => {
      if (status === null) {
        return false;
      }
      // 诊断单：Markdown 正文 + 其中一段 JSON 代码块。旧实现是 JSON 里套 JSON
      // 字符串（statusJson），外部智能体读到的是一堆转义；现在人类可读、机器可解析。
      const text = buildAgentDiagnostic(dep, status, {
        t,
        appVersion: appInfo?.version ?? '',
        bridge: isTauri ? 'tauri' : 'browser',
        locale,
        copiedAt: new Date().toISOString(),
        userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
      });
      const ok = await copyTextToClipboard(text);
      showToast(ok ? t.copySuccessClipboard : t.operationFailed, ok ? 'success' : 'error');
      return ok;
    },
    [status, appInfo, isTauri, locale, showToast, t],
  );

  const handleRecheck = useCallback(() => {
    if (flashPhaseFor(phases, 'recheck') === 'loading') {
      return;
    }
    run('recheck', () => enqueueEnvRefresh(() => actions.recheckEnv()));
  }, [actions, enqueueEnvRefresh, phases, run]);

  const handleFetch = useCallback(() => {
    if (flashPhaseFor(phases, 'fetch') === 'loading') {
      return;
    }
    run('fetch', () => actions.fetchEnvStatus());
  }, [actions, phases, run]);

  const handleCopyAll = useCallback(() => {
    if (flashPhaseFor(phases, 'copyAll') === 'loading') {
      return;
    }
    run('copyAll', () => copyForAgent('all'));
  }, [copyForAgent, phases, run]);

  const rowActions: EnvDepRowActions = {
    selectSource: (dep, mode: EnvSourceMode) => actions.selectEnvSource(dep, mode),
    requestInstall: (dep) => setInstallConfirmDep(dep),
    uninstall: (dep, version) => actions.uninstallEnvDep(dep, version),
    reinstall: (dep, version) => actions.installEnvDep(dep, version),
    setCustomPath: (dep, path) => actions.setEnvCustomPath(dep, path),
    copyForAgent,
    goGroup: (group) => setActiveSettingsGroup(group),
    openExternal: (url) => openUrlByMethod(url),
  };

  const handleInstallConfirm = useCallback(() => {
    const dep = installConfirmDep;
    setInstallConfirmDep(null);
    if (dep === null) {
      return;
    }
    showToast(formatT(t, 'environmentInstallStarted', { dep: envDepLabel(t, dep) }), 'success');
    void actions.installEnvDep(dep);
  }, [installConfirmDep, showToast, t, actions]);

  /** 单行来源恢复默认：来源回自动（已是自动则跳过）+ 清空指定路径（无则跳过）。 */
  const resetOneDepSource = useCallback(
    async (dep: 'node' | 'git' | 'bash'): Promise<boolean> => {
      if (status === null) {
        return false;
      }
      const section = status[dep];
      if (section.mode !== 'auto') {
        if (!(await actions.selectEnvSource(dep, 'auto'))) {
          return false;
        }
      }
      if (section.customPath !== undefined && section.customPath !== '') {
        if (!(await actions.setEnvCustomPath(dep, ''))) {
          return false;
        }
      }
      return true;
    },
    [status, actions],
  );

  /** 组级恢复默认：可操作三行（OPERABLE_DEPS 真源）来源全回自动 + 清空指定路径 + 全量重测，不卸载。 */
  const handleGroupConfirm = useCallback(() => {
    if (groupResetBusy) {
      return;
    }
    setGroupResetBusy(true);
    setGroupResetOpen(false);
    void (async () => {
      try {
        let ok = true;
        for (const dep of OPERABLE_DEPS) {
          if (!(await resetOneDepSource(dep))) {
            ok = false;
            break;
          }
        }
        if (ok) {
          ok = await enqueueEnvRefresh(() => actions.recheckEnv());
        }
        if (ok) {
          showToast(t.settingsResetComplete, 'success');
        }
      } finally {
        setGroupResetBusy(false);
      }
    })();
  }, [groupResetBusy, resetOneDepSource, actions, enqueueEnvRefresh, showToast, t]);

  const handleGroupCancel = useCallback(() => {
    setGroupResetOpen(false);
  }, []);

  const readyCount = status === null ? 0 : countEnvReadyDeps(status);
  const unmetCount = status === null ? 0 : ENV_READY_TOTAL - readyCount;
  // 三态取相（事项 1c）：loading 锁自身，success/error 回显期间同样锁自身防连击。
  const fetchPhase: ActionPhase | null = flashPhaseFor(phases, 'fetch');
  const copyAllPhase: ActionPhase | null = flashPhaseFor(phases, 'copyAll');
  const recheckPhase: ActionPhase | null = flashPhaseFor(phases, 'recheck');

  const blockHint = (key: 'environmentBlockRuntime' | 'environmentBlockSystem') =>
    key === 'environmentBlockRuntime'
      ? t.environmentBlockRuntimeHint
      : t.environmentBlockSystemHint;

  return (
    <div className="adl-settings-section adl-dsh-settings adl-environment-settings">
      <div
        className="adl-dsh-settings__header"
        data-settings-anchor={anchorFor('environment', 'deps')}
      >
        <SettingsHintButton content={t.environmentTitleHint} />
        <SettingsHeader title={t.settingsEnvironment} />
      </div>
      {status === null ? (
        <div className="adl-settings-card">
          <div className="adl-settings-row">
            <div className="adl-settings-row__label">
              <div className="adl-settings-row__label-text">
                <span>{t.environmentLoading}</span>
              </div>
            </div>
            <div className="adl-settings-row__control">
              <button
                type="button"
                className={`adl-dsh-settings__action-btn${fetchPhase ? ' adl-btn-loading' : ''}`}
                disabled={fetchPhase !== null}
                aria-busy={fetchPhase === 'loading'}
                onClick={handleFetch}
              >
                <span className={fetchPhase ? 'adl-btn-loading__text' : undefined}>
                  {t.environmentRecheck}
                </span>
                {fetchPhase ? (
                  <span
                    className={`adl-btn-loading__spinner${fetchPhase === 'loading' ? '' : ` adl-btn-loading__spinner--${fetchPhase}`}`}
                    aria-hidden="true"
                  >
                    <FlashIcon phase={fetchPhase} />
                  </span>
                ) : null}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/*
           * 首启向导 resume 横幅（Task 8）：跳过记账后仍有未就绪项时置顶，
           * “继续向导”把 envWizardDone 置回 false，App 侧 effect 重新打开向导
           *（向导关闭恒写 done=true，故此处不直接碰 skippedAt，横幅随修复消失）。
           */}
          {envWizardSkippedAt !== null && unmetCount > 0 ? (
            <div className="adl-settings-card" data-testid="env-wizard-resume">
              <div className="adl-settings-row">
                <div className="adl-settings-row__label">
                  <div className="adl-settings-row__label-text">
                    <span>
                      {formatT(t, 'environmentWizardResumeBanner', { count: unmetCount })}
                    </span>
                  </div>
                </div>
                <div className="adl-settings-row__control">
                  <button
                    type="button"
                    className="adl-dsh-settings__action-btn"
                    data-settings-row={t.environmentWizardResume}
                    onClick={() => {
                      requestEnvWizard();
                    }}
                  >
                    {t.environmentWizardResume}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          <div className="adl-settings-card" data-testid="env-aggregate">
            <div className="adl-settings-row">
              <div className="adl-settings-row__label">
                <div className="adl-settings-row__label-text">
                  <span>
                    {formatT(t, 'environmentAggregateReady', {
                      ready: readyCount,
                      total: ENV_READY_TOTAL,
                    })}
                  </span>
                  {/* 方案 A：点与链接同条件渲染，status 为 null（聚合条不显示）时自然无点 */}
                  <span aria-hidden="true">{' · '}</span>
                  <button
                    type="button"
                    className={`adl-settings-link${copyAllPhase ? ' adl-btn-loading' : ''}`}
                    data-settings-row={t.environmentCopyAllForAgent}
                    disabled={copyAllPhase !== null}
                    aria-busy={copyAllPhase === 'loading'}
                    onClick={handleCopyAll}
                  >
                    <span className={copyAllPhase ? 'adl-btn-loading__text' : undefined}>
                      {t.environmentCopyAllForAgent}
                    </span>
                    {copyAllPhase ? (
                      <span
                        className={`adl-btn-loading__spinner${copyAllPhase === 'loading' ? '' : ` adl-btn-loading__spinner--${copyAllPhase}`}`}
                        aria-hidden="true"
                      >
                        <FlashIcon phase={copyAllPhase} />
                      </span>
                    ) : null}
                  </button>
                </div>
              </div>
              <div className="adl-settings-row__control adl-settings-row__control--inline">
                <button
                  type="button"
                  className={`adl-dsh-settings__action-btn${recheckPhase ? ' adl-btn-loading' : ''}`}
                  data-settings-row={t.environmentRecheck}
                  disabled={recheckPhase !== null}
                  aria-busy={recheckPhase === 'loading'}
                  onClick={handleRecheck}
                >
                  <span className={recheckPhase ? 'adl-btn-loading__text' : undefined}>
                    {t.environmentRecheck}
                  </span>
                  {recheckPhase ? (
                    <span
                      className={`adl-btn-loading__spinner${recheckPhase === 'loading' ? '' : ` adl-btn-loading__spinner--${recheckPhase}`}`}
                      aria-hidden="true"
                    >
                      <FlashIcon phase={recheckPhase} />
                    </span>
                  ) : null}
                </button>
              </div>
            </div>
          </div>
          {DEP_BLOCKS.map(({ titleKey, deps }) => (
            <Fragment key={titleKey}>
              <div className="adl-dsh-settings__header adl-dsh-settings__header--section">
                <SettingsHintButton content={blockHint(titleKey)} />
                <SettingsHeader
                  title={t[titleKey]}
                  action={
                    <SettingsRefreshButton
                      block
                      label={t[titleKey]}
                      spinning={refreshingBlocks[titleKey] === true}
                      onRefresh={() => void refreshDeps(titleKey, deps)}
                    />
                  }
                />
              </div>
              <div className="adl-settings-card">
                {deps.map((dep) => (
                  <EnvDepRow
                    key={dep}
                    dep={dep}
                    status={status}
                    // 事项 1：不再下发全局 busy，行级各锁自身 pending（无关联行不置灰不断用）。
                    busy={false}
                    isTauri={isTauri}
                    actions={rowActions}
                    refresh={{
                      spinning: (refreshingRows[dep] ?? 0) > 0,
                      onRefresh: () => void refreshDeps(null, [dep]),
                    }}
                  />
                ))}
              </div>
            </Fragment>
          ))}
        </>
      )}

      <ConfirmDialog
        open={installConfirmDep !== null}
        title={formatT(t, 'environmentInstallConfirmTitle', {
          dep: installConfirmDep === null ? '' : envDepLabel(t, installConfirmDep),
        })}
        message={formatT(t, 'environmentInstallConfirmMessage', {
          dep: installConfirmDep === null ? '' : envDepLabel(t, installConfirmDep),
        })}
        confirmLabel={t.confirm}
        cancelLabel={t.cancel}
        onConfirm={handleInstallConfirm}
        onCancel={() => setInstallConfirmDep(null)}
      />
      <ConfirmDialog
        open={groupResetOpen}
        title={formatT(t, 'settingsResetGroupConfirmTitle', { group: t.environmentTitle })}
        message={formatT(t, 'settingsResetGroupConfirmMessage', { group: t.environmentTitle })}
        confirmLabel={t.confirm}
        cancelLabel={t.cancel}
        onConfirm={handleGroupConfirm}
        onCancel={handleGroupCancel}
      />
    </div>
  );
}
