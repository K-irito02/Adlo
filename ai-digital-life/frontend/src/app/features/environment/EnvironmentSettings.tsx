/* eslint-disable react-refresh/only-export-components */
import { Fragment, useCallback, useEffect, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '@i18n/formatT';
import { useAppStore } from '@stores/slicedStore';
import { useAppActions } from '@hooks/useAppActions';
import { openUrlByMethod } from '@features/preview/openByMethod';
import { SettingsHeader } from '@components/settings/SettingsHeader';
import { StaticResetSpacer } from '@components/settings/StaticResetSpacer';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { anchorFor } from '@components/settings/settingsSearchIndex';
import {
  EnvDepRow,
  OPERABLE_DEPS,
  isEnvDepReady,
  type EnvDepKey,
  type EnvDepRowActions,
  type OperableDep,
} from './EnvDepRow';
import { getCachedEnvStatus, isWellFormedEnvStatus, setCachedEnvStatus } from './envStatusCache';
import { RUNBOOKS, type RunbookKey } from './runbooks';
import { envDepLabel } from './depLabels';
import type { EnvSourceMode, EnvStatus } from '../../../shared/ipc/env';

/**
 * 依赖行分块（与网络/DSH 组的「块头 + 卡片」同构，用户 2026-10-25 要求对齐）：
 * 基础依赖（可切来源/装宿主版）→ 系统组件（只读检测）→ 网络与模型（引导类）。
 */
const DEP_BLOCKS: {
  titleKey: 'environmentBlockRuntime' | 'environmentBlockSystem' | 'environmentBlockNetwork';
  deps: EnvDepKey[];
}[] = [
  { titleKey: 'environmentBlockRuntime', deps: ['node', 'git', 'bash'] },
  { titleKey: 'environmentBlockSystem', deps: ['webview2', 'adlserver'] },
  { titleKey: 'environmentBlockNetwork', deps: ['net', 'model'] },
];

/**
 * 聚合条就绪计数分母：5 个 version 信号（node/git/bash/webview2/adlserver
 * meetsBaseline）+ netprobe registryOk = 6。模型行是纯引导（无就绪信号，
 * 把 ciTokenConfigured 计入会冒充模型就绪——Phase 1 parked 红线），不计入。
 */
export const ENV_READY_TOTAL = 6;

/** 就绪项计数（聚合条与向导完成步/跳过横幅共用同一口径）。 */
export function countEnvReadyDeps(status: EnvStatus): number {
  const versionReady = (['node', 'git', 'bash', 'webview2', 'adlserver'] as const).filter((dep) =>
    isEnvDepReady(status[dep]),
  ).length;
  return versionReady + (status.netprobe.registryOk ? 1 : 0);
}

/** 依赖 → runbook 映射（git/bash 共用同一份）。 */
const DEP_RUNBOOK: Record<EnvDepKey, RunbookKey> = {
  node: 'env-node',
  git: 'env-git-bash',
  bash: 'env-git-bash',
  webview2: 'env-webview2',
  adlserver: 'env-adlserver',
  net: 'env-net-download',
  model: 'env-model-credential',
};

/**
 * 全量载荷参与聚合的依赖：模型行无可检测就绪信号（与 ENV_READY_TOTAL 同口径
 * 排除），否则全量载荷永远不可能为 null。
 */
const ALL_RUNBOOK_DEPS = ['node', 'git', 'bash', 'webview2', 'adlserver', 'net'] as const;

function isDepReady(status: EnvStatus, dep: (typeof ALL_RUNBOOK_DEPS)[number]): boolean {
  if (dep === 'net') {
    return status.netprobe.registryOk;
  }
  return isEnvDepReady(status[dep]);
}

/** `all` 载荷只带未就绪项 runbook；全部就绪返回 null（此时不应声称有操作指引）。 */
function allRunbooks(status: EnvStatus): string | null {
  const keys: RunbookKey[] = [];
  for (const dep of ALL_RUNBOOK_DEPS) {
    if (isDepReady(status, dep)) {
      continue;
    }
    const key = DEP_RUNBOOK[dep];
    if (!keys.includes(key)) {
      keys.push(key);
    }
  }
  return keys.length === 0 ? null : keys.map((key) => RUNBOOKS[key]).join('\n\n---\n\n');
}

export interface EnvDepPayload {
  dep: string;
  statusJson: string;
  baseline: string | null;
  /** 匹配的 runbook 全文；`all` 未就绪项为空时 null。 */
  runbook: string | null;
  /** 环境检测数据根（`EnvStatus.dataDir`），供助手定位 hosted 安装与日志。 */
  dataDir: string;
}

export function depPayload(dep: EnvDepKey | 'all', status: EnvStatus): EnvDepPayload {
  const runbook = dep === 'all' ? allRunbooks(status) : RUNBOOKS[DEP_RUNBOOK[dep]];
  if (dep === 'all') {
    return {
      dep,
      statusJson: JSON.stringify(status),
      baseline: null,
      runbook,
      dataDir: status.dataDir,
    };
  }
  if (dep === 'net') {
    return {
      dep,
      statusJson: JSON.stringify(status.netprobe),
      baseline: null,
      runbook,
      dataDir: status.dataDir,
    };
  }
  if (dep === 'model') {
    return {
      dep,
      statusJson: JSON.stringify({
        ciTokenConfigured: status.netprobe.ciTokenConfigured,
        dshReady: status.dshReady,
      }),
      baseline: null,
      runbook,
      dataDir: status.dataDir,
    };
  }
  const section = status[dep];
  return {
    dep,
    statusJson: JSON.stringify(section),
    // bash/adlserver 无版本基线（wire 为空串）：载荷按“无基线”输出 null。
    baseline: section.baselineVersion === '' ? null : section.baselineVersion,
    runbook,
    dataDir: status.dataDir,
  };
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
 * - 组级重置仅侧边栏自助（不进 ResetAll 自动序列）：来源全回自动 + 清空手动路径，
 *   不卸载已装版本（spec §7.2）。
 */
export function EnvironmentSettings() {
  const { t, locale } = useTCopy();
  const actions = useAppActions();
  const isTauri = useAppStore((s) => s.isTauri);
  const envBusy = useAppStore((s) => s.envBusy);
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
  const [blockResetDep, setBlockResetDep] = useState<OperableDep | null>(null);
  const [groupResetOpen, setGroupResetOpen] = useState(false);
  const [groupResetBusy, setGroupResetBusy] = useState(false);

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
   * 组级恢复对话框打开（承接 pending 信号）：守卫先行——组框/任一块框已开/
   * 执行中 → 不消费 pending（信号保留，框关闭后 effect 重试），避免重置意图被
   * 静默吞掉（照抄 NetworkSettings 事项 11 Phase 4 A1-L1）。
   */
  const openGroupResetDialog = useCallback(() => {
    if (groupResetOpen || groupResetBusy || installConfirmDep !== null || blockResetDep !== null) {
      return;
    }
    consumeEnvironmentGroupReset();
    setGroupResetOpen(true);
  }, [
    consumeEnvironmentGroupReset,
    groupResetOpen,
    groupResetBusy,
    installConfirmDep,
    blockResetDep,
  ]);

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
    async (dep: EnvDepKey | 'all') => {
      if (status === null) {
        return;
      }
      // 载荷契约：{ dep, statusJson, baseline, runbook, copyContext }，
      // runbook 为对应依赖（`all` 时为未就绪项）的操作指引全文。
      const payload = {
        ...depPayload(dep, status),
        copyContext: {
          source: 'environment-settings',
          bridge: isTauri ? 'tauri' : 'browser',
          locale,
          copiedAt: new Date().toISOString(),
        },
      };
      const ok = await copyTextToClipboard(JSON.stringify(payload));
      showToast(ok ? t.copySuccessClipboard : t.operationFailed, ok ? 'success' : 'error');
    },
    [status, isTauri, locale, showToast, t],
  );

  const rowActions: EnvDepRowActions = {
    selectSource: (dep, mode: EnvSourceMode) => actions.selectEnvSource(dep, mode),
    requestInstall: (dep) => setInstallConfirmDep(dep),
    uninstall: (dep, version) => actions.uninstallEnvDep(dep, version),
    reinstall: (dep, version) => actions.installEnvDep(dep, version),
    setCustomPath: (dep, path) => actions.setEnvCustomPath(dep, path),
    copyForAgent,
    requestBlockReset: (dep) => setBlockResetDep(dep),
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

  /** 单行来源恢复默认：来源回自动（已是自动则跳过）+ 清空手动路径（无则跳过）。 */
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

  /** 单行恢复默认：来源恢复 + 单行重测。 */
  const resetOneDep = useCallback(
    async (dep: OperableDep): Promise<boolean> => {
      if (status === null) {
        return false;
      }
      if (!(await resetOneDepSource(dep))) {
        return false;
      }
      return actions.recheckEnv(dep);
    },
    [status, actions, resetOneDepSource],
  );

  const handleBlockResetConfirm = useCallback(() => {
    const dep = blockResetDep;
    setBlockResetDep(null);
    if (dep === null) {
      return;
    }
    void (async () => {
      if (await resetOneDep(dep)) {
        showToast(t.settingsResetComplete, 'success');
      }
    })();
  }, [blockResetDep, resetOneDep, showToast, t]);

  /** 组级恢复默认：可操作三行（OPERABLE_DEPS 真源）来源全回自动 + 清空手动路径 + 全量重测，不卸载。 */
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
          ok = await actions.recheckEnv();
        }
        if (ok) {
          showToast(t.settingsResetComplete, 'success');
        }
      } finally {
        setGroupResetBusy(false);
      }
    })();
  }, [groupResetBusy, resetOneDepSource, actions, showToast, t]);

  const handleGroupCancel = useCallback(() => {
    setGroupResetOpen(false);
  }, []);

  const readyCount = status === null ? 0 : countEnvReadyDeps(status);
  const unmetCount = status === null ? 0 : ENV_READY_TOTAL - readyCount;

  const blockResetDepTitle =
    blockResetDep === 'node'
      ? t.environmentDepNode
      : blockResetDep === 'git'
        ? t.environmentDepGit
        : t.environmentDepBash;

  const renderDepBlock = (title: string, deps: EnvDepKey[], envStatus: EnvStatus) => (
    <>
      <div className="adl-dsh-settings__header">
        <StaticResetSpacer />
        <SettingsHeader title={title} />
      </div>
      <div className="adl-settings-card">
        {deps.map((dep) => (
          <EnvDepRow
            key={dep}
            dep={dep}
            status={envStatus}
            busy={envBusy}
            isTauri={isTauri}
            actions={rowActions}
          />
        ))}
      </div>
    </>
  );

  return (
    <div className="adl-settings-section adl-dsh-settings adl-environment-settings">
      <div
        className="adl-dsh-settings__header"
        data-settings-anchor={anchorFor('environment', 'deps')}
      >
        <StaticResetSpacer />
        <SettingsHeader title={t.settingsEnvironment} description={t.environmentDesc} />
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
                className="adl-dsh-settings__action-btn"
                disabled={envBusy}
                onClick={() => {
                  void actions.fetchEnvStatus();
                }}
              >
                {t.environmentRecheck}
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
                </div>
              </div>
              <div className="adl-settings-row__control adl-settings-row__control--inline">
                <button
                  type="button"
                  className="adl-dsh-settings__action-btn"
                  data-settings-row={t.environmentRecheck}
                  disabled={envBusy}
                  onClick={() => {
                    void actions.recheckEnv();
                  }}
                >
                  {t.environmentRecheck}
                </button>
                <button
                  type="button"
                  className="adl-dsh-settings__action-btn"
                  data-settings-row={t.environmentCopyAllForAgent}
                  disabled={envBusy}
                  onClick={() => {
                    void copyForAgent('all');
                  }}
                >
                  {t.environmentCopyAllForAgent}
                </button>
              </div>
            </div>
          </div>
          {DEP_BLOCKS.map(({ titleKey, deps }) => (
            <Fragment key={titleKey}>{renderDepBlock(t[titleKey], deps, status)}</Fragment>
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
        open={blockResetDep !== null}
        title={formatT(t, 'settingsResetGroupConfirmTitle', { group: blockResetDepTitle })}
        message={formatT(t, 'settingsResetGroupConfirmMessage', { group: blockResetDepTitle })}
        confirmLabel={t.confirm}
        cancelLabel={t.cancel}
        onConfirm={handleBlockResetConfirm}
        onCancel={() => setBlockResetDep(null)}
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
