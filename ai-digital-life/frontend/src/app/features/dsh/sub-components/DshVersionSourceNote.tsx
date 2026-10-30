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
  return (
    <>
      <small>{t.dshVersionSourceDesc}</small>
      {/* 自动检测的背后真实状态：下拉仍是「自动检测」，这里只说明实际使用的**来源**
          （宿主托管 / 系统安装 / 外部运行中）。版本是否已安装由下方提示行与状态胶囊表达。
          偏好解析优先：应用自启的托管版本仍显示宿主/系统；只有外部进程才显示「运行中」。 */}
      {mode === 'auto' && (resolvedSource || effectiveSource) ? (
        <AutoResolvedNote>
          {formatT(t, 'settingsAutoResolved', {
            value:
              effectiveSource === 'running' && runningSource === 'external'
                ? t.harnessVersionSourceRunning
                : resolvedSource === 'system'
                  ? t.dshVersionSourceSystem
                  : t.dshVersionSourceHost,
          })}
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
