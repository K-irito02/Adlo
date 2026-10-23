import { useEffect, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '@i18n/formatT';
import { SettingsSelect } from '@components/settings/SettingsSelect';
import { IconResetDefaults } from '../../icons';
import type {
  EnvDependencyState,
  EnvSourceMode,
  EnvStatus,
  EnvTask,
} from '../../../shared/ipc/env';

export type EnvDepKey = 'node' | 'git' | 'bash' | 'webview2' | 'adlserver' | 'net' | 'model';

/** 可安装宿主版本的依赖（后端 `/env/install` 仅支持 node/git）。 */
const INSTALLABLE_DEPS: ReadonlySet<string> = new Set(['node', 'git']);
/** 可切换来源 + 填手动路径的依赖（与后端 `custom_path_supported` 同口径）。 */
const OPERABLE_DEPS: ReadonlySet<string> = new Set(['node', 'git', 'bash']);

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
  setCustomPath: (dep: string, path: string) => Promise<unknown>;
  copyForAgent: (dep: EnvDepKey | 'all') => Promise<void>;
  /** 打开块级恢复默认确认框（来源回自动 + 清空手动路径，不卸载）。 */
  requestBlockReset: (dep: string) => void;
  goGroup: (group: 'dsh' | 'network') => void;
  openExternal: (url: string) => void;
}

export interface EnvDepRowProps {
  dep: EnvDepKey;
  status: EnvStatus;
  busy: boolean;
  isTauri: boolean;
  actions: EnvDepRowActions;
  /** 精简版（向导复用）：隐藏手动路径输入、高级折叠区与兜底行。 */
  compact?: boolean;
}

type PillTone = 'success' | 'warning' | 'info';

function depSection(status: EnvStatus, dep: EnvDepKey): EnvDependencyState | null {
  if (dep === 'net' || dep === 'model') {
    return null;
  }
  return status[dep];
}

/** 依赖就绪判定：有版本 + 达基线 + 来源非空。 */
function isDepReady(section: EnvDependencyState): boolean {
  return section.installedVersion !== null && section.meetsBaseline && section.effective !== 'none';
}

/** 状态灯：五态（就绪/需安装/需手动安装/缺失/版本过低）→ pill 文案与色调。 */
function depPill(
  t: ReturnType<typeof useTCopy>['t'],
  dep: string,
  section: EnvDependencyState,
): { text: string; tone: PillTone } {
  const missing = section.installedVersion === null || section.effective === 'none';
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

/** Bash 系统发行版推导（wire 无 variant 信号，仅展示当前 effective 的归属）。 */
function bashVariantOf(section: EnvDependencyState): 'git' | 'wsl' | 'msys2' | 'manual' {
  if (section.customPath && section.customPath.trim() !== '') {
    return 'manual';
  }
  const path = (section.path ?? '').toLowerCase();
  if (path.includes('wsl')) {
    return 'wsl';
  }
  if (path.includes('msys') || path.includes('mingw')) {
    return 'msys2';
  }
  return 'git';
}

function EnvDepPill({ dep, section }: { dep: string; section: EnvDependencyState }) {
  const { t } = useTCopy();
  const pill = depPill(t, dep, section);
  return (
    <span className={`adl-settings-status adl-settings-status--${pill.tone}`}>{pill.text}</span>
  );
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

/**
 * 环境依赖行（四段式：块头 → 状态行 → 操作行 → 兜底层）。
 *
 * - Node/Git 可操作（来源下拉 + 安装 + 手动路径）；Bash 可操作但无独立安装
 *   （缺失时随宿主 Git 共生，行内给出去装 Git 的引导）；
 * - WebView2/adlserver 只读（版本+状态+引导；WebView2 另有高级折叠区，
 *   FixedVersion 开关暂无后端支撑故禁用并注明由系统安装程序管理）；
 * - net+凭据只读：registry 灯为真实信号；模型 API 通无后端信号，只给
 *   「随 dsh 状态」引导不挂灯；`ciTokenConfigured` 仅作「凭据存储可用」
 *   中性信息展示，绝不标成模型就绪；
 * - 模型凭据行只读无灯，只有去 dsh 侧配置引导。
 */
export function EnvDepRow({
  dep,
  status,
  busy,
  isTauri,
  actions,
  compact = false,
}: EnvDepRowProps) {
  const { t } = useTCopy();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [pathDraft, setPathDraft] = useState<string | null>(null);

  const section = depSection(status, dep);
  // 浏览器模式：系统级行（node/git/bash）的变更类控件置灰 + 追加仅桌面说明
  //（照抄智能体拦截开关模式）；检测展示（重测/复制）与 net/model 行不受影响。
  const browserGated = !isTauri && OPERABLE_DEPS.has(dep);
  const controlsDisabled = busy || browserGated;

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
  const descText = browserGated ? `${depDesc} ${t.settingsAgentDesktopOnlyHint}` : depDesc;

  const sourceOptions = [
    { value: 'auto', label: t.environmentSourceAuto },
    { value: 'system', label: t.environmentSourceSystem },
    { value: 'host', label: t.environmentSourceHost },
  ];

  // 手动路径输入：值 = 草稿 ?? 服务端 customPath；失焦且变化才调桥，
  // 失败回滚草稿（服务端已校验，前端只透传错误，action 侧 toast）。
  const customPath = section?.customPath ?? '';
  useEffect(() => {
    setPathDraft(null);
  }, [customPath, dep]);
  const pathValue = pathDraft ?? customPath;
  const handlePathBlur = () => {
    if (section === null || pathDraft === null) {
      return;
    }
    const next = pathDraft.trim();
    setPathDraft(null);
    if (next === customPath) {
      return;
    }
    void Promise.resolve(actions.setCustomPath(dep, next)).then((ok) => {
      if (ok === false) {
        setPathDraft(customPath);
      }
    });
  };

  const taskForDep =
    section !== null && status.task !== null && status.task.kind === `env-${dep}-install`
      ? status.task
      : null;
  const showInstall =
    section !== null && INSTALLABLE_DEPS.has(dep) && !isDepReady(section) && taskForDep === null;

  const bashVariant = dep === 'bash' && section !== null ? bashVariantOf(section) : null;
  const showBashVariant = bashVariant !== null && section?.mode === 'system';
  const bashVariantLabel =
    bashVariant === 'wsl'
      ? t.environmentBashWsl
      : bashVariant === 'msys2'
        ? t.environmentBashMsys2
        : bashVariant === 'manual'
          ? t.environmentBashCustom
          : t.environmentBashGitBundled;

  const renderStatusLine = () => {
    if (section !== null) {
      const parts = [
        `${t.environmentFieldVersion} ${section.installedVersion ?? t.environmentStatusMissing}`,
      ];
      if (section.path !== null) {
        parts.push(`${t.environmentFieldPath} ${section.path}`);
      }
      const sourceLabel =
        section.mode === 'auto'
          ? t.environmentSourceAuto
          : section.mode === 'system'
            ? t.environmentSourceSystem
            : t.environmentSourceHost;
      parts.push(`${t.environmentFieldSource} ${sourceLabel}`);
      // ' · ' 连接为标点拼接（照抄 DshVersionManagement 版本行标题拼接先例）。
      return <small>{parts.join(' · ')}</small>;
    }
    if (dep === 'net') {
      const { netprobe } = status;
      return (
        <>
          <small>
            <span
              className={`adl-settings-status ${
                netprobe.registryOk
                  ? 'adl-settings-status--success'
                  : 'adl-settings-status--warning'
              }`}
            >
              {netprobe.registryOk ? t.environmentNetRegistry : t.environmentNetRegistryDown}
            </span>
            {netprobe.registryOk ? (
              <> {formatT(t, 'environmentNetLatency', { ms: netprobe.registryLatencyMs })}</>
            ) : null}
          </small>
          <small>
            {t.environmentNetModelApi} · {t.environmentNetFollowDsh}
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

  return (
    <section data-testid={`env-dep-${dep}`}>
      <div className="adl-settings-row">
        <div className="adl-settings-row__label">
          <div className="adl-settings-row__label-text">
            <span>{depTitle}</span>
            {section !== null ? <EnvDepPill dep={dep} section={section} /> : null}
            {OPERABLE_DEPS.has(dep) && !compact ? (
              <button
                type="button"
                className="adl-settings-row__reset"
                title={t.environmentResetSource}
                aria-label={t.environmentResetSource}
                disabled={controlsDisabled}
                onClick={() => actions.requestBlockReset(dep)}
              >
                <IconResetDefaults size={14} decorative />
              </button>
            ) : null}
          </div>
          <small>{descText}</small>
          {renderStatusLine()}
          {dep === 'bash' && section !== null && !isDepReady(section) && !compact ? (
            <small>{t.environmentBashHostedNote}</small>
          ) : null}
          {renderTaskProgress()}
          {showBashVariant && !compact ? (
            <small>{formatT(t, 'environmentBashVariantNote', { variant: bashVariantLabel })}</small>
          ) : null}
          {OPERABLE_DEPS.has(dep) && !compact ? (
            <small>
              <label>
                {t.environmentCustomPathLabel}{' '}
                <input
                  type="text"
                  value={pathValue}
                  placeholder={t.environmentCustomPathPlaceholder}
                  disabled={controlsDisabled}
                  onChange={(e) => setPathDraft(e.target.value)}
                  onBlur={handlePathBlur}
                  aria-label={t.environmentCustomPathLabel}
                />
              </label>
            </small>
          ) : null}
          {dep === 'webview2' && !compact ? (
            <small>
              <button
                type="button"
                aria-expanded={advancedOpen}
                onClick={() => setAdvancedOpen((v) => !v)}
              >
                {t.environmentAdvanced}
              </button>
              {advancedOpen ? (
                <span>
                  {' '}
                  <label>
                    <input type="checkbox" disabled checked={false} readOnly />{' '}
                    {t.environmentFixedVersion}
                  </label>{' '}
                  {t.environmentFixedVersionManagedNote}
                </span>
              ) : null}
            </small>
          ) : null}
        </div>
        {(OPERABLE_DEPS.has(dep) && section !== null) || showInstall ? (
          <div className="adl-settings-row__control">
            {OPERABLE_DEPS.has(dep) && section !== null ? (
              <span data-settings-row={t.environmentSwitch}>
                <SettingsSelect
                  value={section.mode}
                  options={sourceOptions}
                  onChange={(v) => {
                    void actions.selectSource(dep, v as EnvSourceMode);
                  }}
                  label={t.environmentSwitch}
                  disabled={controlsDisabled}
                />
              </span>
            ) : null}
            {showInstall ? (
              <button
                type="button"
                className="adl-dsh-settings__action-btn"
                data-settings-row={t.environmentInstall}
                disabled={controlsDisabled}
                onClick={() => actions.requestInstall(dep)}
              >
                {t.environmentInstall}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {!compact ? (
        <div className="adl-settings-row adl-settings-row--actions">
          <button
            type="button"
            className="adl-dsh-settings__action-btn"
            data-settings-row={t.environmentCopyForAgent}
            disabled={busy}
            onClick={() => {
              void actions.copyForAgent(dep);
            }}
          >
            {t.environmentCopyForAgentNote}
          </button>
          {OFFICIAL_URLS[dep] !== undefined ? (
            <button
              type="button"
              className="adl-dsh-settings__action-btn"
              onClick={() => actions.openExternal(OFFICIAL_URLS[dep])}
            >
              {dep === 'webview2' ? t.environmentWebview2DownloadPage : t.environmentOfficialSite}
            </button>
          ) : null}
          {dep === 'net' ? (
            <button
              type="button"
              className="adl-dsh-settings__action-btn"
              data-settings-row={t.environmentGoToSettings}
              onClick={() => actions.goGroup('network')}
            >
              {t.environmentGoToSettings}
            </button>
          ) : null}
          {dep === 'model' ? (
            <button
              type="button"
              className="adl-dsh-settings__action-btn"
              data-settings-row={t.environmentGoToSettings}
              onClick={() => actions.goGroup('dsh')}
            >
              {t.environmentGoToSettings}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
