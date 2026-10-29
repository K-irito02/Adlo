import { useTCopy } from '@i18n/useTCopy';
import type { DshVersionSourceMode } from '@shared/ipc/dsh';

interface DshVersionSourceNoteProps {
  systemManaged: boolean;
  deferredSource: boolean;
  resolvedSource: 'host' | 'system' | 'none' | null;
  mode: DshVersionSourceMode;
}

/** 版本来源行内的说明行（系统托管 / 下次启动生效 / 无可用来源，旧 DSH 行内警告口径）。 */
export function DshVersionSourceNote({
  systemManaged,
  deferredSource,
  resolvedSource,
  mode,
}: DshVersionSourceNoteProps) {
  const { t } = useTCopy();
  return (
    <>
      <small>{t.dshVersionSourceDesc}</small>
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
