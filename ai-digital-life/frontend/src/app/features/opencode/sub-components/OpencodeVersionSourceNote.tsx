import { useTCopy } from '@i18n/useTCopy';
import { formatT } from '@i18n/formatT';
import { AutoResolvedNote } from '@components/settings/AutoResolvedNote';
import type { DshVersionSourceMode } from '@shared/ipc/dsh';

interface OpencodeVersionSourceNoteProps {
  systemManaged: boolean;
  resolvedSource: 'host' | 'system' | 'none' | null;
  mode: DshVersionSourceMode;
}

/** 版本来源行内的说明行（系统托管 / 无可用来源，旧 OpenCode 行内警告口径）。 */
export function OpencodeVersionSourceNote({
  systemManaged,
  resolvedSource,
  mode,
}: OpencodeVersionSourceNoteProps) {
  const { t } = useTCopy();
  return (
    <>
      {/* 自动检测的背后真实状态：下拉仍是「自动检测」，这里只说明实际使用的**来源**
          （宿主托管 / 系统安装）；版本是否已安装由下方提示行与状态胶囊表达。 */}
      {mode === 'auto' && resolvedSource ? (
        <AutoResolvedNote>
          {formatT(t, 'settingsAutoResolved', {
            value: resolvedSource === 'system' ? t.opencodeSourceSystem : t.opencodeSourceHost,
          })}
        </AutoResolvedNote>
      ) : null}
      {systemManaged ? (
        <small className="adl-harness-version__row-warn">{t.opencodeSystemManagedNote}</small>
      ) : null}
      {!systemManaged && resolvedSource === 'none' ? (
        <small className="adl-harness-version__row-warn">
          {mode === 'host' ? t.opencodeNoSourceHostNote : t.opencodeNoSourceAutoNote}
        </small>
      ) : null}
    </>
  );
}
