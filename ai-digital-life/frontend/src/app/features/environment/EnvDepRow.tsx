/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '@i18n/formatT';
import { SettingsSelect } from '@components/settings/SettingsSelect';
import { AutoResolvedNote } from '@components/settings/AutoResolvedNote';
import { FlashIcon, flashPhaseFor, useActionFlash } from '@components/settings/actionFlash';
import { SettingsHintButton } from '@components/settings/SettingsHintButton';
import { SettingsRowRefresh } from '@components/settings/SettingsRefreshButton';
import type {
  EnvDependencyState,
  EnvSourceMode,
  EnvStatus,
  EnvTask,
} from '../../../shared/ipc/env';

export type EnvDepKey = 'node' | 'git' | 'bash' | 'webview2' | 'adlserver' | 'net' | 'model';

/** 可安装宿主版本的依赖（后端 `/env/install` 仅支持 node/git）。 */
const INSTALLABLE_DEPS: ReadonlySet<string> = new Set(['node', 'git']);
/** 可切换来源 + 填指定路径的依赖（与后端 `custom_path_supported` 同口径；向导/设置组共用同一真源）。 */
export const OPERABLE_DEPS = ['node', 'git', 'bash'] as const;
export type OperableDep = (typeof OPERABLE_DEPS)[number];
const OPERABLE_DEP_SET: ReadonlySet<string> = new Set<string>(OPERABLE_DEPS);
/** 仅有“存在性”信号、后端从不报告版本的依赖（版本段显示检测态而非“缺失”）。 */
const VERSIONLESS_DEPS: ReadonlySet<string> = new Set(['bash', 'adlserver']);

const OFFICIAL_URLS: Record<string, string> = {
  node: 'https://nodejs.org/',
  git: 'https://git-scm.com/',
  bash: 'https://git-scm.com/',
  webview2: 'https://developer.microsoft.com/microsoft-edge/webview2/',
};

export interface EnvDepRowActions {
  selectSource: (dep: string, mode: EnvSourceMode) => Promise<unknown>;
  /** 打开安装确认框（确认后由父组件执行安装，行内不直接调安装）。 */
  requestInstall: (dep: string) => void;
  /** 卸载宿主来源的已装版本（行内两段确认后直调）。 */
  uninstall: (dep: string, version?: string) => Promise<unknown>;
  /** 按当前已装版本重装（复用安装动作）。 */
  reinstall: (dep: string, version: string) => Promise<unknown>;
  setCustomPath: (dep: string, path: string) => Promise<unknown>;
  /** 复制诊断载荷：fulfill 值为 false 判失败（供调用方三态回显），其它判成功。 */
  copyForAgent: (dep: EnvDepKey | 'all') => Promise<unknown>;
  goGroup: (group: 'dsh' | 'network') => void;
  openExternal: (url: string) => void;
}

export interface EnvDepRowProps {
  dep: EnvDepKey;
  status: EnvStatus;
  busy: boolean;
  isTauri: boolean;
  actions: EnvDepRowActions;
  /** 行级刷新（只读行也可用）：标题/状态徽章右侧悬停显现。 */
  refresh?: { spinning: boolean; onRefresh: () => void };
  /** 精简版（向导复用）：隐藏指定路径输入与兜底行。 */
  compact?: boolean;
}

type PillTone = 'success' | 'warning' | 'info';

function depSection(status: EnvStatus, dep: EnvDepKey): EnvDependencyState | null {
  if (dep === 'net' || dep === 'model') {
    return null;
  }
  return status[dep];
}

/** 指定依赖的进行中任务（error 快照不算进行中）。 */
function taskFor(status: EnvStatus, dep: EnvDepKey): EnvTask | null {
  const task = status.task;
  if (task === null || (task.error ?? '') !== '') {
    return null;
  }
  return task.kind === `env-${dep}-install` || task.kind === `env-${dep}-uninstall` ? task : null;
}

const INSTALLABLE_ORDER = ['node', 'git'] as const;

/**
 * 依赖就绪判定：来源非空 + 达基线。版本号可为 null（bash/adlserver 仅有存在性信号），
 * 这不是缺失，故不得把 `installedVersion !== null` 混入就绪条件。
 */
export function isEnvDepReady(section: EnvDependencyState): boolean {
  return section.effective !== 'none' && section.meetsBaseline;
}

/** 状态灯：五态（就绪/需安装/需手动安装/缺失/版本过低）→ pill 文案与色调。 */
function depPill(
  t: ReturnType<typeof useTCopy>['t'],
  dep: string,
  section: EnvDependencyState,
): { text: string; tone: PillTone } {
  const missing = section.effective === 'none';
  if (!missing && section.meetsBaseline) {
    return { text: t.environmentStatusReady, tone: 'success' };
  }
  if (INSTALLABLE_DEPS.has(dep)) {
    return missing
      ? { text: t.environmentStatusNeedInstall, tone: 'warning' }
      : { text: t.environmentStatusTooOld, tone: 'warning' };
  }
  if (dep === 'bash' || dep === 'webview2') {
    return missing
      ? { text: t.environmentStatusNeedManual, tone: 'info' }
      : { text: t.environmentStatusTooOld, tone: 'warning' };
  }
  return missing
    ? { text: t.environmentStatusMissing, tone: 'info' }
    : { text: t.environmentStatusTooOld, tone: 'warning' };
}

function EnvDepPill({ dep, section }: { dep: string; section: EnvDependencyState }) {
  const { t } = useTCopy();
  const pill = depPill(t, dep, section);
  return (
    <span
      className={`adl-settings-status adl-settings-status--${pill.tone} adl-settings-status--compact`}
    >
      {pill.text}
    </span>
  );
}

/** 与行内胶囊相同的状态文案（诊断报告复用，保证界面与复制内容口径一致）。 */
export function envDepStatusLabel(
  t: ReturnType<typeof useTCopy>['t'],
  dep: string,
  section: EnvDependencyState,
): string {
  return depPill(t, dep, section).text;
}

function taskPhaseText(t: ReturnType<typeof useTCopy>['t'], phase: EnvTask['phase']): string {
  switch (phase) {
    case 'preparing':
      return t.environmentTaskPhasePreparing;
    case 'installing':
      return t.environmentTaskPhaseInstalling;
    case 'removing':
      return t.environmentTaskPhaseRemoving;
    case 'finalizing':
      return t.environmentTaskPhaseFinalizing;
  }
}

/** 「来源」展示名：状态行、安装阻断提示共用，避免两处口径漂移。 */
export function sourceLabelFor(t: ReturnType<typeof useTCopy>['t'], mode: EnvSourceMode): string {
  switch (mode) {
    case 'auto':
      return t.environmentSourceAuto;
    case 'system':
      return t.environmentSourceSystem;
    case 'custom':
      return t.environmentSourceCustom;
    case 'host':
      return t.environmentSourceHost;
  }
}

/**
 * 环境依赖行（四段式：块头 → 状态行 → 操作行 → 兜底层）。
 *
 * - Node/Git 可操作（来源下拉 + 安装 + 指定路径，安装按钮独占下一行）；
 *   Bash 可操作且宿主 PortableGit 提供（缺失时行内引导
 *   系统 Git / WSL / MSYS2 / 指定路径）；
 * - WebView2/adlserver 只读（版本+状态+引导，无来源切换）；
 * - 底部帮助链接（复制诊断/官网/前往配置）仅异常时显示；
 * - 设置组只渲染 5 个版本依赖；向导（compact）额外渲染 net/model 引导行。
 */
export function EnvDepRow({
  dep,
  status,
  busy: _globalBusy,
  isTauri,
  actions,
  refresh,
  compact = false,
}: EnvDepRowProps) {
  const { t } = useTCopy();
  const [pathDraft, setPathDraft] = useState<string | null>(null);
  const [pathFocused, setPathFocused] = useState(false);
  // 卸载两段确认（照抄已删除的 DSH 版本组件先例：首击武装，再击执行）。
  const [uninstallArmed, setUninstallArmed] = useState(false);
  // 行级细粒度操作态（事项 1/1c）：行内互斥、各行独立，不再消费全局 busy。
  // 全局 busy（store envBusy）在轮询/任务期间仍为 true，但此处有意忽略，
  // 避免无关联行变灰与禁用；进行中任务由行内 taskForDep 进度条表达。
  // _globalBusy 仅保留 props 兼容（向导仍在传），此处不参与 disabled 判定。
  void _globalBusy;
  // 三态：loading（圆圈）→ success（打勾）/ error（打叉）回显后自动复位。
  // 行级互斥（R1-ENV-03）：同 dep 同一时刻只跑一个操作（防同行并发改同一依赖），
  // 故 ownActive 取整行任一键活跃；跨行隔离不受影响。
  const { phases, run } = useActionFlash();
  const phaseOf = (key: string) => flashPhaseFor(phases, key);
  const ownActive = Object.keys(phases).length > 0;
  // 各控件取相（事项 1c）：来源下拉合并 source/path 两键。
  const copyPhase = phaseOf('copy');
  const selectPhase = phaseOf('source') ?? phaseOf('path');
  const uninstallPhase = phaseOf('uninstall');
  const reinstallPhase = phaseOf('reinstall');

  const section = depSection(status, dep);
  // 浏览器模式：安装/卸载/重装等变更动作置灰 + 追加仅桌面说明；来源切换与
  // 指定路径是本地配置（浏览器模式也可用），只受行级操作态门控（R1-07/R1-14）。
  // 事项 1：移除全局 busy 门控，各行只锁自身；无关联行保持可用。
  const browserGated = !isTauri && OPERABLE_DEP_SET.has(dep);
  const controlsDisabled = browserGated || ownActive;
  const localControlsDisabled = ownActive;

  const depTitle =
    dep === 'net'
      ? t.environmentDepNet
      : dep === 'model'
        ? t.environmentDepModel
        : dep === 'node'
          ? t.environmentDepNode
          : dep === 'git'
            ? t.environmentDepGit
            : dep === 'bash'
              ? t.environmentDepBash
              : dep === 'webview2'
                ? t.environmentDepWebview2
                : t.environmentDepAdlserver;
  const depDesc =
    dep === 'net'
      ? t.environmentDepNetDesc
      : dep === 'model'
        ? t.environmentDepModelDesc
        : dep === 'node'
          ? t.environmentDepNodeDesc
          : dep === 'git'
            ? t.environmentDepGitDesc
            : dep === 'bash'
              ? t.environmentDepBashDesc
              : dep === 'webview2'
                ? t.environmentDepWebview2Desc
                : t.environmentDepAdlserverDesc;
  // 浏览器模式：来源切换与指定路径是本地配置（可用），仅安装/卸载/重装
  // 等变更动作置灰，因此桌面模式提示只挂在可安装行（node/git）且只描述
  // 这类动作，不能暗示整行不可用。
  const installGated = browserGated && (dep === 'node' || dep === 'git');
  // 宿主安装只在 auto/host 下才会成为 effective。system/custom 是用户的显式选择
  // （ADR-0007 不静默降级），此时显示安装按钮会造成「装成功但界面毫无变化」。
  const installBlockedBySource =
    !browserGated &&
    section !== null &&
    INSTALLABLE_DEPS.has(dep) &&
    !isEnvDepReady(section) &&
    (section.mode === 'system' || section.mode === 'custom');
  const descText = [
    depDesc,
    installGated ? t.environmentInstallDesktopOnlyHint : null,
    installBlockedBySource
      ? formatT(t, 'environmentInstallSourceHint', {
          source: sourceLabelFor(t, section.mode),
        })
      : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' ');

  // 来源下拉：node/git/bash 四项（含指定路径，bash 的宿主来源来自 PortableGit）；
  // 其余只读行不展示下拉（showControlColumn 为 false），此处仅为类型完备保留三项。
  const sourceOptions =
    dep === 'node' || dep === 'git' || dep === 'bash'
      ? [
          { value: 'auto', label: t.environmentSourceAuto },
          { value: 'system', label: t.environmentSourceSystem },
          { value: 'host', label: t.environmentSourceHost },
          { value: 'custom', label: t.environmentSourceCustom },
        ]
      : [
          { value: 'auto', label: t.environmentSourceAuto },
          { value: 'system', label: t.environmentSourceSystem },
          { value: 'host', label: t.environmentSourceHost },
        ];

  // 指定路径输入：值 = 草稿 ?? 服务端 customPath；失焦且变化才调桥，
  // 失败回滚草稿（服务端已校验，前端只透传错误，action 侧 toast）。
  const customPath = section?.customPath ?? '';
  useEffect(() => {
    setPathDraft(null);
  }, [customPath, dep]);
  const pathValue = pathDraft ?? customPath;
  const handlePathBlur = () => {
    if (section === null || pathDraft === null || phaseOf('path') === 'loading') {
      return;
    }
    const next = pathDraft.trim();
    setPathDraft(null);
    if (next === customPath) {
      return;
    }
    run('path', () =>
      Promise.resolve(actions.setCustomPath(dep, next)).then((ok) => {
        if (ok === false) {
          setPathDraft(customPath);
        }
        return ok;
      }),
    );
  };

  // task.error 非空 = 后端终态失败：不再当作进行中任务渲染，行回到可操作态
  //（轮询侧已停；后端快照若仍带 error，remount/refetch 也不会复活扫光）。
  const taskForDep = taskFor(status, dep);
  // 断网时安装必失败，故隐藏安装按钮（不以复制按钮替代：行底部已有复制诊断链接，
  // 控制列不再重复出现复制按钮，避免用户误解）。
  const offline = !status.netprobe.registryOk;

  // 搜索行标记唯一性：多个依赖行共享同一操作文案时，只让「首个可用行」携带
  // `data-settings-row`，保证每个登记的行标记在 DOM 中恰好出现一次（R1-11）。
  const firstInstallDep =
    INSTALLABLE_ORDER.find(
      (candidate) => !isEnvDepReady(status[candidate]) && taskFor(status, candidate) === null,
    ) ?? null;

  const firstUninstallDep =
    INSTALLABLE_ORDER.find((candidate) => {
      const candidateSection = status[candidate];
      return (
        candidateSection.effective === 'host' &&
        candidateSection.installedVersion !== null &&
        taskFor(status, candidate) === null
      );
    }) ?? null;
  const firstReinstallDep =
    firstUninstallDep !== null &&
    !(firstUninstallDep === 'git' && status.git.installedVersion !== status.git.baselineVersion)
      ? firstUninstallDep
      : null;
  // 安装按钮仅 node/git、来源允许宿主生效（auto/host）、未就绪、无进行中任务且
  // 在线时出现：把缺失/过低的依赖一键装成宿主内置版本（装完自动生效）。
  const showInstall =
    section !== null &&
    INSTALLABLE_DEPS.has(dep) &&
    (section.mode === 'auto' || section.mode === 'host') &&
    !isEnvDepReady(section) &&
    taskForDep === null &&
    !offline;
  // 向导（compact）行底部无帮助链接，断网时控制列保留复制按钮作唯一诊断出口；
  // 设置组非 compact 行底部已有复制诊断链接，控制列不再重复（用户要求）。
  const showOfflineCopy =
    compact &&
    section !== null &&
    INSTALLABLE_DEPS.has(dep) &&
    !isEnvDepReady(section) &&
    taskForDep === null &&
    offline;

  // 卸载/重装仅对宿主托管的安装类依赖（node/git）可见；系统来源或未安装不出现。
  // 运行中任务（含 remount 后仍带 task 快照）同样不提供按钮，避免重复触发。
  const showUninstallReinstall =
    section !== null &&
    INSTALLABLE_DEPS.has(dep) &&
    section.effective === 'host' &&
    section.installedVersion !== null &&
    taskForDep === null;
  // Git 后端只接受 baseline 版本安装：已装版本与基线不一致时重装必然 4xx，
  // 因此只保留卸载（行内仍可用「安装」升到基线）。
  const showReinstall =
    showUninstallReinstall &&
    section !== null &&
    !(dep === 'git' && section.installedVersion !== section.baselineVersion);

  useEffect(() => {
    if (!showUninstallReinstall) {
      setUninstallArmed(false);
    }
  }, [showUninstallReinstall, dep, section?.installedVersion]);

  const handleUninstallClick = () => {
    if (!showUninstallReinstall || section === null || section.installedVersion === null) {
      return;
    }
    if (!uninstallArmed) {
      setUninstallArmed(true);
      return;
    }
    if (phaseOf('uninstall') === 'loading') {
      return;
    }
    setUninstallArmed(false);
    const version = section.installedVersion;
    run('uninstall', () => Promise.resolve(actions.uninstall(dep, version)));
  };

  const handleCopyClick = () => {
    if (phaseOf('copy') === 'loading') {
      return;
    }
    run('copy', () => Promise.resolve(actions.copyForAgent(dep)));
  };

  const handleSourceChange = (v: string) => {
    if (phaseOf('source') === 'loading') {
      return;
    }
    // 来源变更会重算可卸载性：先解除武装，避免跨来源残留危险态。
    setUninstallArmed(false);
    run('source', () => Promise.resolve(actions.selectSource(dep, v as EnvSourceMode)));
  };

  const handleReinstallClick = () => {
    if (!showReinstall || section === null || section.installedVersion === null) {
      return;
    }
    if (phaseOf('reinstall') === 'loading') {
      return;
    }
    // 重装是另一条执行路径：取消已武装的卸载，避免残留危险态误触。
    setUninstallArmed(false);
    const version = section.installedVersion;
    run('reinstall', () => Promise.resolve(actions.reinstall(dep, version)));
  };

  const renderStatusLine = () => {
    if (section !== null) {
      // bash/adlserver 后端不报告版本（仅存在性）：显示「已检测」而非「缺失」，无检测时用破折号。
      const parts = VERSIONLESS_DEPS.has(dep)
        ? [section.effective === 'none' ? '—' : t.environmentStatusDetected]
        : [
            `${t.environmentFieldVersion} ${section.installedVersion ?? t.environmentStatusMissing}`,
          ];
      if (section.path !== null) {
        parts.push(`${t.environmentFieldPath} ${section.path}`);
      }
      // 来源不再写进路径行：可操作依赖（node/git/bash）由右侧下拉框和
      // AutoResolvedNote 表达；只读依赖（webview2/adl-server）固定自动检测，
      // 无需在状态行重复。
      // ' · ' 连接为标点拼接（照抄旧 DSH 版本组件的版本行标题拼接先例）。
      return <small>{parts.join(' · ')}</small>;
    }
    if (dep === 'net') {
      const { netprobe } = status;
      return (
        <>
          <small>
            {netprobe.registryOk ? (
              <>
                {t.environmentNetRegistry}{' '}
                {formatT(t, 'environmentNetLatency', { ms: netprobe.registryLatencyMs })}
                {' / '}
                {t.environmentNetModelApi} · {t.environmentNetFollowDsh}
              </>
            ) : (
              <>
                {t.environmentNetRegistryDown}
                {' / '}
                {t.environmentNetModelApi} · {t.environmentNetFollowDsh}
              </>
            )}
          </small>
          {netprobe.ciTokenConfigured ? <small>{t.environmentCredentialAvailable}</small> : null}
        </>
      );
    }
    return status.netprobe.ciTokenConfigured ? (
      <small>{t.environmentCredentialAvailable}</small>
    ) : null;
  };

  const renderTaskProgress = () => {
    if (taskForDep === null) {
      return null;
    }
    // total 未知（percent null/总量 0）如实只显示阶段文案，不伪造百分比
    //（扫光样式复用 dsh 任务行 CSS 类）。
    const showCount = taskForDep.total > 0;
    return (
      <small className="adl-dsh-settings__version-task">
        <span className="adl-dsh-settings__version-task-stage" aria-live="polite">
          <span className="adl-dsh-settings__version-task-shimmer">
            {taskPhaseText(t, taskForDep.phase)}
          </span>
          {showCount ? (
            <span className="adl-dsh-settings__version-task-count">
              {taskForDep.done}/{taskForDep.total}
            </span>
          ) : null}
        </span>
      </small>
    );
  };

  // 可操作依赖的 section（node/git/bash）；同时用于控制列可见性与来源下拉，
  // 避免同一守卫在 JSX 里重复出现（TS 窄化也随之只做一次）。
  const operableSection = OPERABLE_DEP_SET.has(dep) ? section : null;
  // 右侧控件列：来源下拉 + 安装/卸载/重装。
  // `showInstall` 蕴含「可操作依赖且 section 非空」。
  const showControlColumn = operableSection !== null;
  // 指定路径输入框：仅当下拉选中「指定路径」时出现，与下拉同一行（在其左边），
  // 切走保留路径仅隐藏（方案 A）；左侧不再出现灰色文案，仅保留无障碍名称。
  const showPathInline =
    OPERABLE_DEP_SET.has(dep) && !compact && operableSection?.mode === 'custom';
  // 路径输入框未聚焦且空值时，하겠다고文本过长展示不完，用缓慢循环滚动的
  // 自定义占位层代替原生 placeholder（原生 placeholder 无法做滚动动画）。
  const showPathMarquee = showPathInline && pathValue === '' && !pathFocused;
  // 底部帮助链接（复制诊断/官网/前往配置）仅异常时显示，正常隐藏防误解：
  // node/git/bash/webview2/adlserver 以未就绪为准；net 以下载源不可达为准；
  // model 以助手未就绪为准（钥匙箱可用不代表已配好，见 renderStatusLine）。
  const showHelpLinks = (() => {
    if (compact) {
      return false;
    }
    if (dep === 'net') {
      return !status.netprobe.registryOk;
    }
    if (dep === 'model') {
      return !status.dshReady;
    }
    return section !== null && !isEnvDepReady(section);
  })();
  // 副标题问号提示文案：大众化详细版，短描述仅保留在副标题下方。
  const depHint =
    dep === 'net'
      ? t.environmentDepNetHint
      : dep === 'model'
        ? t.environmentDepModelHint
        : dep === 'node'
          ? t.environmentDepNodeHint
          : dep === 'git'
            ? t.environmentDepGitHint
            : dep === 'bash'
              ? t.environmentDepBashHint
              : dep === 'webview2'
                ? t.environmentDepWebview2Hint
                : t.environmentDepAdlserverHint;

  return (
    <section data-testid={`env-dep-${dep}`}>
      <div className="adl-settings-row">
        <div className="adl-settings-row__label">
          <div className="adl-settings-row__label-text">
            {!compact ? <SettingsHintButton content={depHint} /> : null}
            <span>{depTitle}</span>
            {section !== null ? <EnvDepPill dep={dep} section={section} /> : null}
            {refresh ? (
              <SettingsRowRefresh
                refresh={{
                  label: depTitle,
                  spinning: refresh.spinning,
                  onRefresh: refresh.onRefresh,
                }}
                disabled={ownActive}
              />
            ) : null}
          </div>
          <small>{descText}</small>
          {/* 自动检测的背后真实状态（蓝色提示行）：下拉仍是「自动检测」。 */}
          {section !== null &&
          section.mode === 'auto' &&
          section.effective !== 'none' &&
          !compact &&
          OPERABLE_DEP_SET.has(dep) ? (
            <AutoResolvedNote>
              {formatT(t, 'settingsAutoResolved', {
                value:
                  section.effective === 'system'
                    ? t.environmentSourceSystem
                    : t.environmentSourceHost,
              })}
            </AutoResolvedNote>
          ) : null}
          {renderStatusLine()}
          {renderTaskProgress()}
          {showHelpLinks ? (
            <small>
              <button
                type="button"
                className={`adl-dsh-settings__inline-link${copyPhase ? ' adl-btn-loading' : ''}`}
                data-settings-row={dep === 'node' ? t.environmentCopyForAgent : undefined}
                disabled={ownActive}
                aria-busy={copyPhase === 'loading'}
                onClick={handleCopyClick}
              >
                <span className={copyPhase ? 'adl-btn-loading__text' : undefined}>
                  {t.environmentCopyForAgentNote}
                </span>
                {copyPhase ? (
                  <span
                    className={`adl-btn-loading__spinner${copyPhase === 'loading' ? '' : ` adl-btn-loading__spinner--${copyPhase}`}`}
                    aria-hidden="true"
                  >
                    <FlashIcon phase={copyPhase} />
                  </span>
                ) : null}
              </button>
              {OFFICIAL_URLS[dep] !== undefined ? (
                <>
                  {' · '}
                  <button
                    type="button"
                    className="adl-dsh-settings__inline-link"
                    onClick={() => actions.openExternal(OFFICIAL_URLS[dep])}
                  >
                    {dep === 'webview2'
                      ? t.environmentWebview2DownloadPage
                      : t.environmentOfficialSite}
                  </button>
                </>
              ) : null}
              {dep === 'net' || dep === 'model' ? (
                <>
                  {' · '}
                  <button
                    type="button"
                    className="adl-dsh-settings__inline-link"
                    data-settings-row={dep === 'net' ? t.environmentGoToSettings : undefined}
                    onClick={() => actions.goGroup(dep === 'net' ? 'network' : 'dsh')}
                  >
                    {t.environmentGoToSettings}
                  </button>
                </>
              ) : null}
            </small>
          ) : null}
        </div>
        {showControlColumn ? (
          <div className="adl-settings-row__control adl-env-control">
            <div className="adl-env-control__main">
              {showPathInline ? (
                <span
                  className="adl-env-path-inline"
                  data-settings-row={dep === 'node' ? t.environmentCustomPathLabel : undefined}
                >
                  <input
                    id={`env-custom-path-${dep}`}
                    type="text"
                    className="adl-settings-input adl-env-path-input"
                    value={pathValue}
                    placeholder={showPathMarquee ? '' : t.environmentCustomPathPlaceholder}
                    aria-label={t.environmentCustomPathLabel}
                    disabled={localControlsDisabled}
                    onChange={(e) => setPathDraft(e.target.value)}
                    onFocus={() => setPathFocused(true)}
                    onBlur={() => {
                      setPathFocused(false);
                      handlePathBlur();
                    }}
                  />
                  {showPathMarquee ? (
                    <span className="adl-env-path-marquee" aria-hidden="true">
                      <span className="adl-env-path-marquee__track">
                        <span className="adl-env-path-marquee__chunk">
                          {t.environmentCustomPathPlaceholder}
                        </span>
                        <span className="adl-env-path-marquee__chunk" aria-hidden="true">
                          {t.environmentCustomPathPlaceholder}
                        </span>
                      </span>
                    </span>
                  ) : null}
                </span>
              ) : null}
              {operableSection !== null ? (
                <span data-settings-row={dep === 'node' ? t.environmentSwitch : undefined}>
                  <SettingsSelect
                    value={operableSection.mode}
                    options={sourceOptions}
                    onChange={handleSourceChange}
                    label={t.environmentSwitch}
                    disabled={localControlsDisabled}
                    loading={selectPhase ?? false}
                  />
                </span>
              ) : null}
            </div>
            {showInstall || showOfflineCopy || showUninstallReinstall ? (
              <div className="adl-env-control__actions">
                {showInstall ? (
                  <button
                    type="button"
                    className="adl-dsh-settings__action-btn"
                    data-settings-row={dep === firstInstallDep ? t.environmentInstall : undefined}
                    disabled={controlsDisabled}
                    onClick={() => actions.requestInstall(dep)}
                  >
                    {t.environmentInstall}
                  </button>
                ) : null}
                {showOfflineCopy ? (
                  <button
                    type="button"
                    className={`adl-dsh-settings__action-btn${copyPhase ? ' adl-btn-loading' : ''}`}
                    disabled={ownActive}
                    aria-busy={copyPhase === 'loading'}
                    onClick={handleCopyClick}
                  >
                    <span className={copyPhase ? 'adl-btn-loading__text' : undefined}>
                      {t.environmentCopyForAgent}
                    </span>
                    {copyPhase ? (
                      <span
                        className={`adl-btn-loading__spinner${copyPhase === 'loading' ? '' : ` adl-btn-loading__spinner--${copyPhase}`}`}
                        aria-hidden="true"
                      >
                        <FlashIcon phase={copyPhase} />
                      </span>
                    ) : null}
                  </button>
                ) : null}
                {showUninstallReinstall ? (
                  <>
                    <button
                      type="button"
                      className={`adl-dsh-settings__action-btn${
                        uninstallArmed ? ' adl-dsh-settings__action-btn--danger' : ''
                      }${uninstallPhase ? ' adl-btn-loading' : ''}`}
                      data-settings-row={
                        dep === firstUninstallDep ? t.environmentUninstall : undefined
                      }
                      disabled={controlsDisabled}
                      aria-busy={uninstallPhase === 'loading'}
                      onClick={handleUninstallClick}
                    >
                      <span className={uninstallPhase ? 'adl-btn-loading__text' : undefined}>
                        {t.environmentUninstall}
                      </span>
                      {uninstallPhase ? (
                        <span
                          className={`adl-btn-loading__spinner${uninstallPhase === 'loading' ? '' : ` adl-btn-loading__spinner--${uninstallPhase}`}`}
                          aria-hidden="true"
                        >
                          <FlashIcon phase={uninstallPhase} />
                        </span>
                      ) : null}
                    </button>
                    {showReinstall ? (
                      <button
                        type="button"
                        className={`adl-dsh-settings__action-btn${reinstallPhase ? ' adl-btn-loading' : ''}`}
                        data-settings-row={
                          dep === firstReinstallDep ? t.environmentReinstall : undefined
                        }
                        disabled={controlsDisabled}
                        aria-busy={reinstallPhase === 'loading'}
                        onClick={handleReinstallClick}
                      >
                        <span className={reinstallPhase ? 'adl-btn-loading__text' : undefined}>
                          {t.environmentReinstall}
                        </span>
                        {reinstallPhase ? (
                          <span
                            className={`adl-btn-loading__spinner${reinstallPhase === 'loading' ? '' : ` adl-btn-loading__spinner--${reinstallPhase}`}`}
                            aria-hidden="true"
                          >
                            <FlashIcon phase={reinstallPhase} />
                          </span>
                        ) : null}
                      </button>
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
