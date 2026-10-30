import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '@i18n/formatT';
import { AutoResolvedNote } from '@components/settings/AutoResolvedNote';
import type { DshVersionSourceMode } from '@shared/ipc/dsh';

interface DshVersionSourceNoteProps {
  systemManaged: boolean;
  deferredSource: boolean;
  resolvedSource: 'host' | 'system' | 'none' | null;
  /** 运行时实际来源（含 running）：自动检测下优先于偏好解析展示。 */
  effectiveSource: 'running' | 'host' | 'system' | 'none' | null;
  mode: DshVersionSourceMode;
}

/** 版本来源行内的说明行（系统托管 / 下次启动生效 / 无可用来源，旧 DSH 行内警告口径）。 */
export function DshVersionSourceNote({
  systemManaged,
  deferredSource,
  resolvedSource,
  effectiveSource,
  mode,
}: DshVersionSourceNoteProps) {
  const { t } = useTCopy();
  return (
    <>
      <small>{t.dshVersionSourceDesc}</small>
      {/* 自动检测的背后真实状态：下拉仍是「自动检测」，这里只说明实际使用的**来源**
          （正在运行 / 宿主托管 / 系统安装）；版本是否已安装由下方提示行与状态胶囊表达。 */}
      {mode === 'auto' && (resolvedSource || effectiveSource) ? (
        <AutoResolvedNote>
          {formatT(t, 'settingsAutoResolved', {
            value:
              effectiveSource === 'running'
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
      {!systemManaged && resolvedSource === 'none' ? (
        <small className="adl-harness-version__row-warn">
          {mode === 'host' ? t.dshNoSourceHostNote : t.dshNoSourceAutoNote}
        </small>
      ) : null}
    </>
  );
}
