import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '@i18n/formatT';
import { useAppStore } from '@stores/slicedStore';
import { useAppActions } from '@hooks/useAppActions';
import { buildAgentDiagnostic } from './diagnostic';
import { copyTextToClipboard } from './EnvironmentSettings';
import {
  prefetchOpencodeSnapshot,
  resetOpencodeSnapshotCache,
} from '@features/opencode/opencodeVersionBridge';
import { IconCheck } from '@icons';
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
/** 等待后台 env 任务的上限：500ms × 600 = 5 分钟。慢网络下单次下载可能远超 2 分钟，
 *  旧值 240（2 分钟）会把仍在正常下载的任务误判为「安装超时」。 */
const MAX_WAIT_POLLS = 600;
/** 等「别的依赖占着任务槽」收尾的上限：500ms × 120 = 1 分钟，避免为一次切换久等。 */
const BUSY_DRAIN_POLLS = 120;

/** 后端 env 任务槽被占用时的错误（并发占用不是安装失败，应等待而不是计为一次失败）。 */
function isEnvTaskBusy(message: string): boolean {
  return /another env task is already running/i.test(message);
}

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
  <svg
    viewBox="0 0 256 256"
    width="11"
    height="11"
    fill="none"
    aria-hidden="true"
    focusable="false"
  >
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
  <svg
    viewBox="0 0 256 256"
    width="10"
    height="10"
    fill="none"
    aria-hidden="true"
    focusable="false"
  >
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
  const setEnvWizardSkippedAt = useAppStore((s) => s.setEnvWizardSkippedAt);
  const showToast = useAppStore((s) => s.showToast);

  const [items, setItems] = useState<ItemState[]>(initialItems);
  // 初值取 `running`：挂载 effect 立刻开始准备，`detecting` 从来没有独立视觉
  // （标题在非 done 时恒为 `firstRunTitleRunning`）。真正的首帧防护在页脚：
  // 终态必须显式判 `phase === 'done'`（见下方 footer 注释）；初值只是让两态模型成立。
  const [phase, setPhase] = useState<'running' | 'done'>('running');
  const [activeId, setActiveId] = useState<ItemId | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState('');
  const [copyFlash, setCopyFlash] = useState(false);
  const copyFlashTimer = useRef<number | null>(null);

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

  /** 记录一次失败尝试（统一 history 格式），并进入 retrying。 */
  const recordAttemptFailure = useCallback(
    (id: ItemId, attempt: number, error: string) => {
      patchItem(id, {
        status: 'retrying',
        error,
        history: [
          ...(itemsRef.current.find((item) => item.id === id)?.history ?? []),
          `${attempt}/${MAX_ATTEMPTS}: ${error}`,
        ],
      });
    },
    [patchItem],
  );

  /** 第 1–3 次失败后的 1s/3s/8s 退避；第 4 次不再等待。 */
  const backoff = useCallback(async (attempt: number) => {
    if (attempt < MAX_ATTEMPTS) {
      await sleep(BACKOFF_MS[attempt - 1]);
    }
  }, []);

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

  const shortError = useCallback(
    (error: string | null): string => {
      if (!error) {
        return t.firstRunErrorGeneric;
      }
      // 向导自己写入的本地化短句直接展示；后端原文（英文/URL）只做分类映射，
      // 完整内容留在「预览诊断单」，避免界面混入非 i18n 文本。
      const known = [
        t.firstRunBashMissing,
        t.firstRunGitNotReady,
        t.firstRunBridgeUnavailable,
        t.firstRunInstallNotReady,
        t.firstRunInstallTimeout,
        t.firstRunNoOfficialVersion,
      ];
      if (known.includes(error)) {
        return error;
      }
      if (/decoding response body/i.test(error)) {
        return t.firstRunErrorDecode;
      }
      if (/timeout|timed out/i.test(error)) {
        return t.firstRunErrorTimeout;
      }
      if (/HTTP \d{3}/i.test(error)) {
        return t.firstRunErrorHttp;
      }
      if (/disk|space|空间/i.test(error)) {
        return t.firstRunErrorDisk;
      }
      if (/network/i.test(error)) {
        return t.firstRunErrorNetwork;
      }
      return t.firstRunErrorGeneric;
    },
    [t],
  );

  const metaFor = useCallback(
    (item: ItemState): string => {
      if (item.status === 'done') {
        return item.note;
      }
      if (item.status === 'error') {
        // 未进入安装循环（桥接不可用、无可用版本等）时没有尝试过，不能谎报重试耗尽。
        return item.attempt > 0 ? t.firstRunRetriesExhausted : t.firstRunFailed;
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
    async (
      dep: 'node' | 'git',
      maxPolls = MAX_WAIT_POLLS,
    ): Promise<{ ok: boolean; error?: string }> => {
      if (!envBridge) {
        return { ok: false, error: t.firstRunBridgeUnavailable };
      }
      // 只认本依赖的安装任务：并发占用分支等待的是**别的**依赖，不能把它的
      // 进度/错误算到本行头上。
      const expectKind = `env-${dep}-install`;
      let empty = 0;
      for (let i = 0; i < maxPolls; i += 1) {
        if (!mountedRef.current) {
          return { ok: false, error: t.firstRunInstallTimeout };
        }
        await sleep(500);
        const result = await envBridge.getStatus();
        if (!result.ok) {
          continue;
        }
        const task = result.data.task;
        const ours = task?.kind === expectKind;
        // 别依赖的「错误快照」不占任务槽（begin_with 会直接替换），按「无任务」继续判定，
        // 否则并发等待会白等到预算耗尽。
        if (task && (ours || !task.error)) {
          empty = 0;
          if (ours) {
            patchItem(dep, { progress: task.percent ?? 0 });
            if (task.error) {
              return { ok: false, error: task.error };
            }
          }
          continue;
        }
        empty += 1;
        const section = result.data[dep];
        // 首启只认宿主托管：系统版本即使达标也不算本次安装完成。
        if (section.effective === 'host' && section.meetsBaseline) {
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

  /** 任务成功收尾：统一写 done，避免三处重复。 */
  const markEnvDone = useCallback(
    (id: 'node' | 'git') => {
      patchItem(id, {
        status: 'done',
        progress: 100,
        note: t.firstRunHostedNote,
        error: null,
      });
    },
    [patchItem, t],
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
          // 并发占用不是安装失败：等占用方收尾后再判定一次（单独的短预算，
          // 不为别的依赖久等）。
          if (isEnvTaskBusy(started.error.message)) {
            const drained = await waitEnvTask(id, BUSY_DRAIN_POLLS);
            if (drained.ok) {
              markEnvDone(id);
              return true;
            }
          }
          recordAttemptFailure(id, attempt, started.error.message);
        } else {
          const result = await waitEnvTask(id);
          if (result.ok) {
            markEnvDone(id);
            return true;
          }
          recordAttemptFailure(id, attempt, result.error ?? t.firstRunInstallNotReady);
        }
        await backoff(attempt);
      }
      patchItem(id, { status: 'error' });
      return false;
    },
    [backoff, envBridge, markEnvDone, patchItem, recordAttemptFailure, t, waitEnvTask],
  );

  const verifyBash = useCallback(async (): Promise<boolean> => {
    if (!envBridge) {
      patchItem('bash', { status: 'error', error: t.firstRunBridgeUnavailable });
      return false;
    }
    // Bash 由宿主 Git 提供；Git 未就绪时如实说明，避免「包未包含 bash」的误读。
    let gitNotHosted = false;
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
      if (result.ok) {
        if (result.data.bash.effective === 'host') {
          patchItem('bash', {
            status: 'done',
            note: t.firstRunBashBundled,
            error: null,
          });
          return true;
        }
        // 每次轮询重新判定：Git 后续可能已被切成宿主，别让早期结果粘住。
        gitNotHosted = result.data.git.effective !== 'host';
      }
      if (attempt < MAX_ATTEMPTS) {
        patchItem('bash', { status: 'retrying' });
      }
      await backoff(attempt);
    }
    patchItem('bash', {
      status: 'error',
      error: gitNotHosted ? t.firstRunGitNotReady : t.firstRunBashMissing,
    });
    return false;
  }, [backoff, envBridge, patchItem, t]);

  const installHarnessItem = useCallback(
    async (id: 'dsh' | 'opencode'): Promise<boolean> => {
      const bridge = id === 'dsh' ? dshBridge : opencodeBridge;
      if (!bridge) {
        patchItem(id, { status: 'error', error: t.firstRunBridgeUnavailable });
        return false;
      }
      // 来源状态是本地事实（系统安装探测 + 宿主选中版本），断网也能用：
      // 已装好就不该因为查不到在线目录而报失败。
      const source = await bridge.getSourceStatus();
      if (source.ok && source.data.system) {
        patchItem(id, { status: 'done', system: true, note: t.firstRunSystemNote });
        return true;
      }
      if (source.ok && source.data.versionSource.hostVersion !== null) {
        patchItem(id, { status: 'done', note: t.firstRunHostedNote });
        return true;
      }
      const status = await bridge.getVersionStatus();
      if (status.ok && status.data.installed.length > 0) {
        patchItem(id, { status: 'done', note: t.firstRunHostedNote });
        return true;
      }
      // 没有可用版本才需要在线目录；目录查询失败同样计入尝试次数并退避重试，
      // 避免「0/4 次尝试却显示已用尽重试」的误导。
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
        const catalog = await bridge.getVersionCatalog();
        if (!catalog.ok) {
          recordAttemptFailure(id, attempt, catalog.error.message);
          await backoff(attempt);
          continue;
        }
        const version = catalog.data.latestStable ?? catalog.data.latestPrerelease;
        if (!version) {
          // 目录查得到但没有可装版本：重试无意义，如实显示「失败」而非重试耗尽。
          patchItem(id, {
            status: 'error',
            error: t.firstRunNoOfficialVersion,
            attempt: 0,
            retries: 0,
          });
          return false;
        }
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
        recordAttemptFailure(id, attempt, result.error.message);
        await backoff(attempt);
      }
      patchItem(id, { status: 'error' });
      return false;
    },
    [backoff, dshBridge, opencodeBridge, patchItem, recordAttemptFailure, t],
  );

  const finish = useCallback(async () => {
    setPhase('done');
    setActiveId(null);
    setEnvWizardDone(true);
    // 有失败项就记一次「跳过」，让环境组的续接横幅可以提醒补装；全部就绪则清掉。
    setEnvWizardSkippedAt(
      itemsRef.current.some((item) => item.status === 'error') ? Date.now() : null,
    );

    // Q2：Node/Git/Bash 的来源偏好钉到宿主托管；用户主动选过系统兜底的项
    // （system=true）不覆盖。随后刷新 env store 与两个 harness 组，避免设置
    // 面板停留在安装前的旧快照（用户实测：切组后才变成宿主托管）。
    const env = typeof window !== 'undefined' ? window.digitalLife?.env : undefined;
    if (env) {
      const runtimeDone = (['node', 'git', 'bash'] as const).filter((id) => {
        const item = itemsRef.current.find((candidate) => candidate.id === id);
        return item?.status === 'done' && !item.system;
      });
      await Promise.all(runtimeDone.map((id) => env.selectSource(id, 'host').catch(() => null)));
    }
    await actions.recheckEnv().catch(() => false);
    // DSH 组用 source+version+catalog 原子快照；OpenCode 组用模块级快照缓存。
    void useAppStore.getState().fetchDshSettingsSnapshot(true);
    resetOpencodeSnapshotCache();
    void prefetchOpencodeSnapshot();
  }, [actions, setEnvWizardDone, setEnvWizardSkippedAt]);

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
        await finish();
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
            // 首启始终安装宿主托管：系统安装即使达标也不能跳过（否则 finish()
            // 会把来源钉成 host，却没有宿主副本，反而把可用环境判成缺失）。
            if (section.effective === 'host' && section.meetsBaseline) {
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
      // 已装版本优先看本地来源状态（system / hostVersion），不依赖在线目录：
      // 断网时 getVersionStatus 可能整体失败，但本地已装的版本依然可用。
      if (dshSource?.ok && dshSource.data.system) {
        patchItem('dsh', { status: 'done', system: true, note: t.firstRunSystemNote });
      } else if (dshSource?.ok && dshSource.data.versionSource.hostVersion !== null) {
        patchItem('dsh', { status: 'done', note: t.firstRunHostedNote });
      } else if (dshStatus?.ok && dshStatus.data.installed.length > 0) {
        patchItem('dsh', { status: 'done', note: t.firstRunHostedNote });
      }
      if (ocSource?.ok && ocSource.data.system) {
        patchItem('opencode', { status: 'done', system: true, note: t.firstRunSystemNote });
      } else if (ocSource?.ok && ocSource.data.versionSource.hostVersion !== null) {
        patchItem('opencode', { status: 'done', note: t.firstRunHostedNote });
      } else if (ocStatus?.ok && ocStatus.data.installed.length > 0) {
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
      await finish();
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
      if (copyFlashTimer.current !== null) {
        window.clearTimeout(copyFlashTimer.current);
      }
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
    async (id: ItemId) => {
      if (id !== 'node' && id !== 'git' && id !== 'bash') {
        return;
      }
      patchItem(id, { status: 'detecting', error: null });
      const switched = await actions.selectEnvSource(id, 'system').catch(() => false);
      const status = envBridge ? await envBridge.getStatus() : null;
      const section = status?.ok ? status.data[id] : null;
      if (switched && section?.effective === 'system' && section.meetsBaseline) {
        patchItem(id, {
          status: 'done',
          system: true,
          note: t.firstRunSystemNote,
          error: null,
        });
        return;
      }
      // 系统副本不达标/切换失败时如实报错，不再无条件标成就绪。
      patchItem(id, { status: 'error', error: t.firstRunSystemUnavailable });
    },
    [actions, envBridge, patchItem, t],
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
    if (ok) {
      setCopyFlash(true);
      if (copyFlashTimer.current !== null) {
        window.clearTimeout(copyFlashTimer.current);
      }
      copyFlashTimer.current = window.setTimeout(() => {
        setCopyFlash(false);
        copyFlashTimer.current = null;
      }, 1500);
    }
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

  // 诊断单入口：运行中失败与完成态失败两处页脚共用，避免两份拷贝各自漂移。
  const copyPreviewActions = (
    <div className="adl-fr-foot__left">
      <button
        type="button"
        className="adl-fr-link adl-fr-copy-link"
        onClick={() => void copyReport()}
      >
        {copyFlash ? <IconCheck size={12} decorative className="adl-fr-copy-check" /> : null}
        <span>{t.environmentCopyForAgentNote}</span>
      </button>
      <button type="button" className="adl-fr-link" onClick={() => void openReport()}>
        {t.firstRunPreview}
      </button>
    </div>
  );

  // 页脚二分：完成态（phase === 'done'）才渲染开始/重试；未结束时只有已出现失败项
  // 才出现诊断单入口。终态必须以 `phase === 'done'` 显式判定——用「非 running」当
  // 终态会把完成页脚画到任何新增的瞬时态上（首帧闪烁的根因：曾用 `detecting` 初值，
  // 首帧画出完成页脚、次帧收起，实测高度 313 → 248、整卡上下各跳 32px）。
  const footer =
    phase === 'done' ? (
      failed.length > 0 ? (
        <div className="adl-fr-foot">
          {copyPreviewActions}
          <div className="adl-fr-foot__right">
            <button
              type="button"
              className="adl-fr-btn adl-fr-btn--secondary"
              onClick={close}
              data-testid="first-run-wizard-close"
            >
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
            <button
              type="button"
              className="adl-fr-btn adl-fr-btn--primary"
              onClick={close}
              data-testid="first-run-wizard-close"
            >
              {t.firstRunStart}
            </button>
          </div>
        </div>
      )
    ) : failed.length > 0 ? (
      <div className="adl-fr-foot">{copyPreviewActions}</div>
    ) : null;

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
                <span className="adl-fr-fail__err">{shortError(item.error)}</span>
                {item.id === 'node' || item.id === 'git' || item.id === 'bash' ? (
                  <button
                    type="button"
                    className="adl-fr-link"
                    onClick={() => void applySystemFallback(item.id)}
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
