import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '@i18n/formatT';
import { useAppStore } from '@stores/slicedStore';
import { useAppActions } from '@hooks/useAppActions';
import { buildAgentDiagnostic } from './diagnostic';
import { copyTextToClipboard } from './EnvironmentSettings';
import type { EnvStatus } from '../../../shared/ipc/env';
import './firstRunProvisioning.css';

/**
 * 首次运行准备（方案 A · 任务清单）。
 *
 * 五项固定顺序：node → git → bash → dsh → opencode。
 * - node/git：始终安装宿主托管，忽略系统版本。
 * - bash：随宿主 PortableGit 提供，Git 完成后验证 `bin/bash.exe`。
 * - dsh/opencode：本机已有（系统或宿主）则跳过；否则装当前包线最新正式版，
 *   无正式版退最新预发布版。
 * - 每项首次 + 3 次重试（共 4 次尝试），退避 1s/3s/8s；仍失败则跳过并继续。
 * - 没有跳过按钮；关闭窗口后下次启动按已安装状态续跑。
 *
 * 编排复用现有 IPC（env / dsh / opencode），不新增并行后端任务队列。
 */

type ItemId = 'node' | 'git' | 'bash' | 'dsh' | 'opencode';
type ItemStatus =
  | 'pending'
  | 'detecting'
  | 'downloading'
  | 'installing'
  | 'retrying'
  | 'done'
  | 'error';

interface ItemState {
  id: ItemId;
  status: ItemStatus;
  progress: number;
  attempt: number;
  retries: number;
  error: string | null;
  note: string;
  system: boolean;
  history: string[];
}

const ITEM_IDS: ItemId[] = ['node', 'git', 'bash', 'dsh', 'opencode'];
const MAX_ATTEMPTS = 4;
const BACKOFF_MS = [1000, 3000, 8000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function initialItems(): ItemState[] {
  return ITEM_IDS.map((id) => ({
    id,
    status: 'pending',
    progress: 0,
    attempt: 0,
    retries: 0,
    error: null,
    note: '',
    system: false,
    history: [],
  }));
}

const TICK = (
  <svg viewBox="0 0 256 256" width="11" height="11" fill="none" aria-hidden="true">
    <polyline
      points="216 72 104 184 48 128"
      stroke="currentColor"
      strokeWidth="26"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const CROSS = (
  <svg viewBox="0 0 256 256" width="10" height="10" fill="none" aria-hidden="true">
    <path
      d="M200 56 56 200 M56 56l144 144"
      stroke="currentColor"
      strokeWidth="26"
      strokeLinecap="round"
    />
  </svg>
);

function ItemIcon({ status }: { status: ItemStatus }) {
  if (status === 'done') {
    return <span className="adl-fr-ico adl-fr-ico--done">{TICK}</span>;
  }
  if (status === 'error') {
    return <span className="adl-fr-ico adl-fr-ico--error">{CROSS}</span>;
  }
  if (status === 'pending') {
    return (
      <span className="adl-fr-ico adl-fr-ico--pending">
        <span className="adl-fr-dot" />
      </span>
    );
  }
  return (
    <span className="adl-fr-ico adl-fr-ico--active">
      <span className="adl-fr-spinner" />
    </span>
  );
}

export interface FirstRunProvisioningWizardProps {
  onClose: () => void;
}

export function FirstRunProvisioningWizard({ onClose }: FirstRunProvisioningWizardProps) {
  const { t, locale } = useTCopy();
  const actions = useAppActions();
  const appInfo = useAppStore((s) => s.appInfo);
  const isTauri = useAppStore((s) => s.isTauri);
  const setActiveSettingsGroup = useAppStore((s) => s.setActiveSettingsGroup);
  const setEnvWizardDone = useAppStore((s) => s.setEnvWizardDone);
  const showToast = useAppStore((s) => s.showToast);

  const [items, setItems] = useState<ItemState[]>(initialItems);
  const [phase, setPhase] = useState<'detecting' | 'running' | 'done'>('detecting');
  const [activeId, setActiveId] = useState<ItemId | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState('');

  const itemsRef = useRef<ItemState[]>(items);
  const runIdRef = useRef(0);
  const startedRef = useRef(false);
  const mountedRef = useRef(true);

  const commit = useCallback((next: ItemState[]) => {
    itemsRef.current = next;
    if (mountedRef.current) {
      setItems(next);
    }
  }, []);

  const patchItem = useCallback(
    (id: ItemId, patch: Partial<ItemState>) => {
      if (!mountedRef.current) {
        return;
      }
      commit(itemsRef.current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    },
    [commit],
  );

  const labelFor = useCallback(
    (id: ItemId): string => {
      switch (id) {
        case 'node':
          return t.environmentDepNode;
        case 'git':
          return t.environmentDepGit;
        case 'bash':
          return t.environmentDepBash;
        case 'dsh':
          return t.harnessWizardDsh;
        case 'opencode':
          return t.harnessWizardOpencode;
      }
    },
    [t],
  );

  const metaFor = useCallback(
    (item: ItemState): string => {
      if (item.status === 'done') {
        return item.note;
      }
      if (item.status === 'error') {
        return t.firstRunRetriesExhausted;
      }
      if (item.status === 'retrying') {
        return formatT(t, 'firstRunRetryCount', { n: item.retries });
      }
      if (item.status === 'downloading') {
        return `${item.progress}%`;
      }
      if (item.status === 'detecting') {
        return t.firstRunDetecting;
      }
      return '';
    },
    [t],
  );

  const envBridge = typeof window !== 'undefined' ? window.digitalLife?.env : undefined;
  const dshBridge = typeof window !== 'undefined' ? window.digitalLife?.dsh : undefined;
  const opencodeBridge = typeof window !== 'undefined' ? window.digitalLife?.opencode : undefined;

  const waitEnvTask = useCallback(
    async (dep: 'node' | 'git'): Promise<{ ok: boolean; error?: string }> => {
      if (!envBridge) {
        return { ok: false, error: t.firstRunBridgeUnavailable };
      }
      let empty = 0;
      for (let i = 0; i < 240; i += 1) {
        if (!mountedRef.current) {
          return { ok: false, error: t.firstRunInstallTimeout };
        }
        await sleep(500);
        const result = await envBridge.getStatus();
        if (!result.ok) {
          continue;
        }
        const task = result.data.task;
        if (task) {
          empty = 0;
          patchItem(dep, { progress: task.percent ?? 0 });
          if (task.error) {
            return { ok: false, error: task.error };
          }
          continue;
        }
        empty += 1;
        const section = result.data[dep];
        if (section.effective !== 'none' && section.meetsBaseline) {
          return { ok: true };
        }
        if (empty >= 4) {
          return { ok: false, error: t.firstRunInstallNotReady };
        }
      }
      return { ok: false, error: t.firstRunInstallTimeout };
    },
    [envBridge, patchItem, t],
  );

  const installEnvItem = useCallback(
    async (id: 'node' | 'git'): Promise<boolean> => {
      if (!envBridge) {
        patchItem(id, { status: 'error', error: t.firstRunBridgeUnavailable });
        return false;
      }
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        if (!mountedRef.current) {
          return false;
        }
        patchItem(id, {
          status: 'downloading',
          progress: 0,
          attempt,
          retries: attempt - 1,
          error: null,
        });
        const started = await envBridge.install(id);
        if (!started.ok) {
          const error = started.error.message;
          patchItem(id, {
            status: 'retrying',
            error,
            history: [
              ...(itemsRef.current.find((i) => i.id === id)?.history ?? []),
              `${attempt}/4: ${error}`,
            ],
          });
        } else {
          const result = await waitEnvTask(id);
          if (result.ok) {
            patchItem(id, {
              status: 'done',
              progress: 100,
              note: t.firstRunHostedNote,
              error: null,
            });
            return true;
          }
          patchItem(id, {
            status: 'retrying',
            error: result.error ?? null,
            history: [
              ...(itemsRef.current.find((i) => i.id === id)?.history ?? []),
              `${attempt}/4: ${result.error ?? t.firstRunInstallNotReady}`,
            ],
          });
        }
        if (attempt < MAX_ATTEMPTS) {
          await sleep(BACKOFF_MS[attempt - 1]);
        }
      }
      patchItem(id, { status: 'error' });
      return false;
    },
    [envBridge, patchItem, t, waitEnvTask],
  );

  const verifyBash = useCallback(async (): Promise<boolean> => {
    if (!envBridge) {
      patchItem('bash', { status: 'error', error: t.firstRunBridgeUnavailable });
      return false;
    }
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      if (!mountedRef.current) {
        return false;
      }
      patchItem('bash', {
        status: 'installing',
        attempt,
        retries: attempt - 1,
        error: null,
      });
      const result = await envBridge.getStatus();
      if (result.ok && result.data.bash.effective === 'host') {
        patchItem('bash', {
          status: 'done',
          note: t.firstRunBashBundled,
          error: null,
        });
        return true;
      }
      if (attempt < MAX_ATTEMPTS) {
        patchItem('bash', { status: 'retrying' });
        await sleep(500);
      }
    }
    patchItem('bash', { status: 'error', error: t.firstRunBashMissing });
    return false;
  }, [envBridge, patchItem, t]);

  const installHarnessItem = useCallback(
    async (id: 'dsh' | 'opencode'): Promise<boolean> => {
      const bridge = id === 'dsh' ? dshBridge : opencodeBridge;
      if (!bridge) {
        patchItem(id, { status: 'error', error: t.firstRunBridgeUnavailable });
        return false;
      }
      const source = await bridge.getSourceStatus();
      if (source.ok && source.data.system) {
        patchItem(id, { status: 'done', system: true, note: t.firstRunSystemNote });
        return true;
      }
      const status = await bridge.getVersionStatus();
      if (
        status.ok &&
        (status.data.installed.length > 0 ||
          (source.ok && source.data.versionSource.hostVersion !== null))
      ) {
        patchItem(id, { status: 'done', note: t.firstRunHostedNote });
        return true;
      }
      const catalog = await bridge.getVersionCatalog();
      if (!catalog.ok) {
        patchItem(id, { status: 'error', error: catalog.error.message });
        return false;
      }
      const version = catalog.data.latestStable ?? catalog.data.latestPrerelease;
      if (!version) {
        patchItem(id, { status: 'error', error: t.firstRunNoOfficialVersion });
        return false;
      }
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        if (!mountedRef.current) {
          return false;
        }
        patchItem(id, {
          status: 'downloading',
          progress: 0,
          attempt,
          retries: attempt - 1,
          error: null,
        });
        const poll = window.setInterval(() => {
          void bridge.getVersionTask().then((task) => {
            if (task.ok && task.data.task) {
              patchItem(id, { progress: task.data.task.percent ?? 0 });
            }
          });
        }, 500);
        const result = await bridge.installVersion(version);
        window.clearInterval(poll);
        if (result.ok) {
          patchItem(id, {
            status: 'done',
            progress: 100,
            note: t.firstRunHostedNote,
            error: null,
          });
          return true;
        }
        patchItem(id, {
          status: 'retrying',
          error: result.error.message,
          history: [
            ...(itemsRef.current.find((i) => i.id === id)?.history ?? []),
            `${attempt}/4: ${result.error.message}`,
          ],
        });
        if (attempt < MAX_ATTEMPTS) {
          await sleep(BACKOFF_MS[attempt - 1]);
        }
      }
      patchItem(id, { status: 'error' });
      return false;
    },
    [dshBridge, opencodeBridge, patchItem, t],
  );

  const finish = useCallback(() => {
    setPhase('done');
    setActiveId(null);
    setEnvWizardDone(true);
  }, [setEnvWizardDone]);

  const runProvisioning = useCallback(
    async (mode: 'initial' | 'retry') => {
      const runId = runIdRef.current + 1;
      runIdRef.current = runId;
      setPhase('running');
      setReportOpen(false);

      const pending = itemsRef.current.filter((item) =>
        mode === 'initial' ? item.status !== 'done' : item.status === 'error',
      );
      if (pending.length === 0) {
        finish();
        return;
      }

      // 先检测：已经就绪的项直接完成，避免重复下载。
      if (envBridge) {
        const env = await envBridge.getStatus();
        if (runId !== runIdRef.current) {
          return;
        }
        if (env.ok) {
          for (const id of ['node', 'git'] as const) {
            const section = env.data[id];
            if (section.effective !== 'none' && section.meetsBaseline) {
              patchItem(id, { status: 'done', note: t.firstRunHostedNote });
            }
          }
          if (env.data.bash.effective === 'host') {
            patchItem('bash', { status: 'done', note: t.firstRunBashBundled });
          }
        }
      }

      const [dshSource, dshStatus, ocSource, ocStatus] = await Promise.all([
        dshBridge ? dshBridge.getSourceStatus() : Promise.resolve(null),
        dshBridge ? dshBridge.getVersionStatus() : Promise.resolve(null),
        opencodeBridge ? opencodeBridge.getSourceStatus() : Promise.resolve(null),
        opencodeBridge ? opencodeBridge.getVersionStatus() : Promise.resolve(null),
      ]);
      if (runId !== runIdRef.current) {
        return;
      }
      if (dshSource?.ok && dshSource.data.system) {
        patchItem('dsh', { status: 'done', system: true, note: t.firstRunSystemNote });
      } else if (
        dshStatus?.ok &&
        (dshStatus.data.installed.length > 0 ||
          (dshSource?.ok && dshSource.data.versionSource.hostVersion !== null))
      ) {
        patchItem('dsh', { status: 'done', note: t.firstRunHostedNote });
      }
      if (ocSource?.ok && ocSource.data.system) {
        patchItem('opencode', { status: 'done', system: true, note: t.firstRunSystemNote });
      } else if (
        ocStatus?.ok &&
        (ocStatus.data.installed.length > 0 ||
          (ocSource?.ok && ocSource.data.versionSource.hostVersion !== null))
      ) {
        patchItem('opencode', { status: 'done', note: t.firstRunHostedNote });
      }

      const stillPending = itemsRef.current.filter((item) => item.status !== 'done');
      for (const item of stillPending) {
        if (runId !== runIdRef.current) {
          return;
        }
        setActiveId(item.id);
        if (item.id === 'node' || item.id === 'git') {
          await installEnvItem(item.id);
        } else if (item.id === 'bash') {
          await verifyBash();
        } else {
          await installHarnessItem(item.id);
        }
      }
      if (runId !== runIdRef.current) {
        return;
      }
      finish();
    },
    [
      dshBridge,
      envBridge,
      finish,
      installEnvItem,
      installHarnessItem,
      opencodeBridge,
      patchItem,
      t,
      verifyBash,
    ],
  );

  useEffect(() => {
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;
    void runProvisioning('initial');
    return () => {
      mountedRef.current = false;
      runIdRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const failed = items.filter((item) => item.status === 'error');
  const doneCount = items.filter((item) => item.status === 'done').length;
  const allDone = phase === 'done' && failed.length === 0;

  const title =
    phase === 'done'
      ? failed.length > 0
        ? formatT(t, 'firstRunTitleFailed', { n: failed.length })
        : t.firstRunTitleDone
      : t.firstRunTitleRunning;

  const close = useCallback(() => {
    setEnvWizardDone(true);
    onClose();
  }, [onClose, setEnvWizardDone]);

  const jump = useCallback(
    (group: 'environment' | 'dsh' | 'opencode') => {
      setEnvWizardDone(true);
      setActiveSettingsGroup(group);
      onClose();
    },
    [onClose, setActiveSettingsGroup, setEnvWizardDone],
  );

  const applySystemFallback = useCallback(
    (id: ItemId) => {
      if (id === 'node' || id === 'git' || id === 'bash') {
        void actions.selectEnvSource(id, 'system');
      }
      patchItem(id, {
        status: 'done',
        system: true,
        note: t.firstRunSystemNote,
        error: null,
      });
    },
    [actions, patchItem, t],
  );

  const buildReport = useCallback(async (): Promise<string> => {
    const lines: string[] = [];
    lines.push(`# ${t.firstRunReportTitle}`, '');
    lines.push(`## ${t.environmentDiagnosticTaskTitle}`, '');
    lines.push(t.firstRunReportTask, '');
    lines.push(`## ${t.firstRunReportItems}`, '');
    for (const item of itemsRef.current) {
      lines.push(`### ${labelFor(item.id)} — ${metaFor(item) || t.firstRunWaiting}`, '');
      lines.push(`- ${t.firstRunReportAttempts}: ${item.attempt}/${MAX_ATTEMPTS}`);
      if (item.note) {
        lines.push(`- ${item.note}`);
      }
      if (item.error) {
        lines.push(`- ${item.error}`);
      }
      for (const entry of item.history) {
        lines.push(`- ${entry}`);
      }
      lines.push('');
    }
    lines.push(`## ${t.firstRunReportEnv}`, '');
    let envStatus: EnvStatus | null = null;
    if (envBridge) {
      const result = await envBridge.getStatus();
      if (result.ok) {
        envStatus = result.data;
      }
    }
    if (envStatus) {
      lines.push(
        buildAgentDiagnostic('all', envStatus, {
          t,
          appVersion: appInfo?.version ?? '',
          bridge: isTauri ? 'tauri' : 'browser',
          locale,
          copiedAt: new Date().toISOString(),
          userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
        }),
      );
    } else {
      lines.push(t.firstRunReportNoEnv);
    }
    if (failed.length === 0) {
      lines.push('', t.firstRunReportNoFailures);
    }
    return lines.join('\n');
  }, [appInfo, envBridge, failed.length, isTauri, labelFor, locale, metaFor, t]);

  const openReport = useCallback(async () => {
    setReportText(await buildReport());
    setReportOpen(true);
  }, [buildReport]);

  const copyReport = useCallback(async () => {
    const text = await buildReport();
    const ok = await copyTextToClipboard(text);
    showToast(ok ? t.firstRunCopySuccess : t.firstRunCopyFailed, ok ? 'success' : 'error');
  }, [buildReport, showToast, t]);

  const guideRow = (
    name: string,
    group: 'environment' | 'dsh' | 'opencode',
    groupLabel: string,
  ) => (
    <div className="adl-fr-guide__row" key={group}>
      <span className="adl-fr-guide__name">{name}</span>
      <span className="adl-fr-guide__path">
        {formatT(t, 'firstRunPath', { group: groupLabel })}
      </span>
      <button type="button" className="adl-fr-link" onClick={() => jump(group)}>
        {t.firstRunGo}
      </button>
    </div>
  );

  const footer =
    phase === 'running' ? (
      failed.length > 0 ? (
        <div className="adl-fr-foot">
          <div className="adl-fr-foot__left">
            <button type="button" className="adl-fr-link" onClick={() => void copyReport()}>
              {t.environmentCopyForAgentNote}
            </button>
            <button type="button" className="adl-fr-link" onClick={() => void openReport()}>
              {t.firstRunPreview}
            </button>
          </div>
        </div>
      ) : null
    ) : failed.length > 0 ? (
      <div className="adl-fr-foot">
        <div className="adl-fr-foot__left">
          <button type="button" className="adl-fr-link" onClick={() => void copyReport()}>
            {t.environmentCopyForAgentNote}
          </button>
          <button type="button" className="adl-fr-link" onClick={() => void openReport()}>
            {t.firstRunPreview}
          </button>
        </div>
        <div className="adl-fr-foot__right">
          <button type="button" className="adl-fr-btn adl-fr-btn--secondary" onClick={close}>
            {t.environmentWizardEnter}
          </button>
          <button
            type="button"
            className="adl-fr-btn adl-fr-btn--primary"
            onClick={() => void runProvisioning('retry')}
          >
            {t.firstRunRetry}
          </button>
        </div>
      </div>
    ) : (
      <div className="adl-fr-foot">
        <div className="adl-fr-foot__left">
          <span className="adl-fr-foot__note">{t.firstRunFooterNote}</span>
        </div>
        <div className="adl-fr-foot__right">
          <button type="button" className="adl-fr-btn adl-fr-btn--primary" onClick={close}>
            {t.firstRunStart}
          </button>
        </div>
      </div>
    );

  const doneBlock =
    phase === 'done' ? (
      <div className="adl-fr-done">
        <div className="adl-fr-summary">
          <div className="adl-fr-summary__num">
            {doneCount}
            <span>/{items.length}</span>
          </div>
          <div className="adl-fr-summary__title">
            {failed.length > 0
              ? formatT(t, 'firstRunSummaryFailed', { ready: doneCount, failed: failed.length })
              : t.firstRunSummaryAllReady}
          </div>
        </div>
        <div className="adl-fr-guide">
          <div className="adl-fr-guide__title">{t.firstRunGuideTitle}</div>
          {guideRow(
            `${t.environmentDepNode}、${t.environmentDepGit}、${t.environmentDepBash}`,
            'environment',
            t.settingsEnvironment,
          )}
          {guideRow(t.harnessWizardDsh, 'dsh', t.settingsDsh)}
          {guideRow(t.harnessWizardOpencode, 'opencode', t.settingsOpencode)}
        </div>
        {failed.length > 0 ? (
          <div className="adl-fr-fail">
            <div className="adl-fr-fail__head">
              {formatT(t, 'firstRunFailedItems', { n: failed.length })}
            </div>
            {failed.map((item) => (
              <div className="adl-fr-fail__row" key={item.id}>
                <span className="adl-fr-fail__name">{labelFor(item.id)}</span>
                <span className="adl-fr-fail__err">{item.error ?? t.firstRunFailed}</span>
                {item.id === 'node' || item.id === 'git' || item.id === 'bash' ? (
                  <button
                    type="button"
                    className="adl-fr-link"
                    onClick={() => applySystemFallback(item.id)}
                  >
                    {t.firstRunUseSystem}
                  </button>
                ) : null}
              </div>
            ))}
            <div className="adl-fr-fail__hint">{t.firstRunFailureHint}</div>
          </div>
        ) : null}
      </div>
    ) : null;

  return createPortal(
    <div
      className="adl-fr-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="first-run-wizard"
    >
      <div className="adl-fr-dialog">
        <div className="adl-fr-head">
          <h2 className="adl-fr-title">{title}</h2>
        </div>
        <div className="adl-fr-body">
          <ol className="adl-fr-tasks" aria-label={t.firstRunTitleRunning}>
            {items.map((item) => {
              const active = item.id === activeId && item.status !== 'error';
              return (
                <li
                  key={item.id}
                  className={`adl-fr-task adl-fr-task--${item.status}`}
                  aria-current={active ? 'step' : undefined}
                >
                  <ItemIcon status={item.status} />
                  <span className={`adl-fr-task__label${active ? ' adl-fr-shimmer' : ''}`}>
                    {labelFor(item.id)}
                  </span>
                  <span className="adl-fr-task__meta">{metaFor(item)}</span>
                </li>
              );
            })}
          </ol>
          {doneBlock}
        </div>
        {footer}
      </div>
      {reportOpen ? (
        <div className="adl-fr-report-overlay" role="dialog" aria-modal="true">
          <div className="adl-fr-report">
            <div className="adl-fr-report__head">
              <div>
                <div className="adl-fr-report__title">{t.firstRunPreview}</div>
                <div className="adl-fr-report__sub">
                  {formatT(t, 'firstRunReportSize', {
                    kb: (reportText.length / 1024).toFixed(1),
                  })}
                </div>
              </div>
              <div className="adl-fr-report__actions">
                <button
                  type="button"
                  className="adl-fr-btn adl-fr-btn--secondary"
                  onClick={() => setReportOpen(false)}
                >
                  {t.firstRunClose}
                </button>
                <button
                  type="button"
                  className="adl-fr-btn adl-fr-btn--primary"
                  onClick={() => void copyReport()}
                >
                  {t.firstRunCopy}
                </button>
              </div>
            </div>
            <pre className="adl-fr-report__body">{reportText}</pre>
          </div>
        </div>
      ) : null}
      <span className="adl-fr-sr-only" role="status" aria-live="polite">
        {phase === 'done'
          ? allDone
            ? t.firstRunSummaryAllReady
            : formatT(t, 'firstRunSummaryFailed', { ready: doneCount, failed: failed.length })
          : title}
      </span>
    </div>,
    document.body,
  );
}
