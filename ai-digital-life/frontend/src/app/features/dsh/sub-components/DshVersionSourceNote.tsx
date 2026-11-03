import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '@i18n/formatT';
import { AutoResolvedNote } from '@components/settings/AutoResolvedNote';
import type { DshVersionSourceMode } from '@shared/ipc/dsh';

interface DshVersionSourceNoteProps {
  /**
   * 版本由系统安装提供（偏好为系统安装、或偏好解析落在系统安装），用于显示
   * 「由你自己维护」的说明。与卡片隐藏「当前版本」行用的「系统安装真实生效」
   * （`HarnessVersionSourceStatus.systemManaged`）不是同一件事：本字段也覆盖
   * 「钉住系统但本机没有副本」——此时没有版本在用，说明按来源口径陈述即可。
   */
  systemPinned: boolean;
  deferredSource: boolean;
  resolvedSource: 'host' | 'system' | 'none' | null;
  /** 运行时实际来源（含 running）。 */
  effectiveSource: 'running' | 'host' | 'system' | 'none' | null;
  /**
   * 运行中实例的来源：本次会话托管拉起的进程精确已知（host/system）；
   * `external` 表示来源不可知，标签退回偏好解析结果（解析为系统安装即报系统安装）。
   */
  runningSource?: 'host' | 'system' | 'external' | null;
  mode: DshVersionSourceMode;
}

/**
 * 版本来源行内的说明行：描述小字 + 「自动检测真实来源」蓝色提示行 + 工具专属警告
 * （系统托管 / 下次启动生效 / 无可用来源，旧 DSH 行内警告口径）。
 */
export function DshVersionSourceNote({
  systemPinned,
  deferredSource,
  resolvedSource,
  effectiveSource,
  runningSource = null,
  mode,
}: DshVersionSourceNoteProps) {
  const { t } = useTCopy();
  // 运行中实例的披露规则：本次会话托管的进程来源精确已知（`host`/`system`）；
  // 外部进程来源不可知（`running_payload` 恒填 `external`），只能退回偏好解析结果。
  const runningActive = effectiveSource === 'running';
  const knownRunning = runningActive && (runningSource === 'system' || runningSource === 'host');
  const hasDisclosure = runningActive || resolvedSource === 'system' || resolvedSource === 'host';
  // 标签口径：运行中且来源已知 → 取进程自身来源；其余落在「系统安装」的（含外部进程
  // 在跑、偏好解析为系统安装）一律报「系统安装」—— 本机没有宿主副本时，能跑起来的
  // 助手本来就是系统安装，不该报成含混的「运行中」（用户实测 2026-11-04）。
  const resolvedLabel = knownRunning
    ? runningSource === 'system'
      ? t.dshVersionSourceSystem
      : t.dshVersionSourceHost
    : resolvedSource === 'system'
      ? t.dshVersionSourceSystem
      : runningActive
        ? t.harnessVersionSourceRunning
        : t.dshVersionSourceHost;
  // 下拉当前显示的值（与标签逐字比较，避免「同一来源说两遍」）。
  const selectedLabel =
    mode === 'system'
      ? t.dshVersionSourceSystem
      : mode === 'host'
        ? t.dshVersionSourceHost
        : t.dshVersionSourceAuto;
  // 蓝行只在与下拉选择不同时占位：钉住系统安装且实际就是它 → 隐藏（用户 2026-11-04 决策）；
  // 钉住宿主但外部实例在跑 → 仍显示「运行中」（与下拉不一致，必须披露）。
  const showResolved =
    hasDisclosure && (mode === 'auto' || runningActive) && resolvedLabel !== selectedLabel;
  return (
    <>
      <small>{t.dshVersionSourceDesc}</small>
      {/* 自动检测的背后真实状态：下拉仍是「自动检测」，这里说明实际使用的**来源**。
          偏好已钉住时只在「与下拉不一致」时出现：钉住宿主但外部实例在跑 → 运行中；
          钉住系统安装但本机已没有系统副本 → 退回解析结果（无来源时即运行中）。
          钉住系统安装且实际就是它 → 与下拉重复，不占位（用户 2026-11-04 决策）。
          偏好解析优先：应用自启的托管版本仍显示宿主/系统；只有来源不可知的外部进程
          才显示「运行中」。解析落在「系统安装」时恒报「系统安装」——本机没有宿主副本
          可跑，外部进程也只能是系统那份（用户实测 2026-11-04）。 */}
      {showResolved ? (
        <AutoResolvedNote>
          {formatT(t, 'settingsAutoResolved', { value: resolvedLabel })}
        </AutoResolvedNote>
      ) : null}
      {systemPinned ? (
        <small className="adl-harness-version__row-warn">{t.dshSystemManagedNote}</small>
      ) : null}
      {deferredSource ? (
        <small className="adl-harness-version__row-warn">{t.dshVersionSourceDeferredNote}</small>
      ) : null}
      {!systemPinned && resolvedSource === 'none' && effectiveSource !== 'running' ? (
        <small className="adl-harness-version__row-warn">
          {mode === 'host' ? t.dshNoSourceHostNote : t.dshNoSourceAutoNote}
        </small>
      ) : null}
    </>
  );
}
