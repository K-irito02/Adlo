import { useTCopy } from '@i18n/useTCopy';
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
