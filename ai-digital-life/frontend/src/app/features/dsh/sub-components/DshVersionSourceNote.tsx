import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '@i18n/formatT';
import { AutoResolvedNote } from '@components/settings/AutoResolvedNote';
import type { DshVersionSourceMode } from '@shared/ipc/dsh';

interface DshVersionSourceNoteProps {
  systemManaged: boolean;
  deferredSource: boolean;
  resolvedSource: 'host' | 'system' | 'none' | null;
  /** 运行时实际来源（含 running）。 */
  effectiveSource: 'running' | 'host' | 'system' | 'none' | null;
  /** 运行中实例的来源：`external` 才在状态行显示「运行中」，应用自启仍按偏好来源显示。 */
  runningSource?: 'host' | 'system' | 'external' | null;
  mode: DshVersionSourceMode;
}

/**
 * 版本来源行内的说明行：描述小字 + 「自动检测真实来源」蓝色提示行 + 工具专属警告
 * （系统托管 / 下次启动生效 / 无可用来源，旧 DSH 行内警告口径）。
 */
export function DshVersionSourceNote({
  systemManaged,
  deferredSource,
  resolvedSource,
  effectiveSource,
  runningSource = null,
  mode,
}: DshVersionSourceNoteProps) {
  const { t } = useTCopy();
  // running 状态在两种场景都要披露：自动检测下说明「实际是运行中的实例」；
  // 偏好已钉住时，只要实际生效落在 running（外部进程，或应用自启但来源与偏好不一致），
  // 也必须说明，否则下拉与实际生效不一致却无处可见。
  const runningActive = effectiveSource === 'running';
  const showResolved = (resolvedSource || effectiveSource) && (mode === 'auto' || runningActive);
  const resolvedLabel = runningActive
    ? runningSource === 'system'
      ? t.dshVersionSourceSystem
      : runningSource === 'host'
        ? t.dshVersionSourceHost
        : t.harnessVersionSourceRunning
    : resolvedSource === 'system'
      ? t.dshVersionSourceSystem
      : t.dshVersionSourceHost;
  return (
    <>
      <small>{t.dshVersionSourceDesc}</small>
      {/* 自动检测的背后真实状态：下拉仍是「自动检测」，这里只说明实际使用的**来源**
          （宿主托管 / 系统安装 / 外部运行中）。
          外部运行中不只在「自动检测」下才值得说明：用户把来源钉成宿主/系统、但机器上已有
          外部启动的实例在跑时，实际生效的就是那个实例，来源行必须如实说明，否则该状态无处可见。
          偏好解析优先：应用自启的托管版本仍显示宿主/系统；只有外部进程才显示「运行中」。 */}
      {showResolved ? (
        <AutoResolvedNote>
          {formatT(t, 'settingsAutoResolved', { value: resolvedLabel })}
        </AutoResolvedNote>
      ) : null}
      {systemManaged ? (
        <small className="adl-harness-version__row-warn">{t.dshSystemManagedNote}</small>
      ) : null}
      {deferredSource ? (
        <small className="adl-harness-version__row-warn">{t.dshVersionSourceDeferredNote}</small>
      ) : null}
      {!systemManaged && resolvedSource === 'none' && effectiveSource !== 'running' ? (
        <small className="adl-harness-version__row-warn">
          {mode === 'host' ? t.dshNoSourceHostNote : t.dshNoSourceAutoNote}
        </small>
      ) : null}
    </>
  );
}
