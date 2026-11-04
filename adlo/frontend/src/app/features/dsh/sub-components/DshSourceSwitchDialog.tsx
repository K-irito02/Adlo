import type { RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { Spinner } from '@components/Spinner';
import type { DshSourceSwitchState } from '../useDshSourceSwitch';

interface DshSourceSwitchDialogProps {
  state: DshSourceSwitchState | null;
  busy: boolean;
  cancelRef: RefObject<HTMLButtonElement | null>;
  onChoice: (choice: 'next' | 'now' | 'cancel') => void;
  onDismiss: () => void;
}

/** 版本来源切换确认框：立即生效 / 下次启动生效 / 取消。 */
export function DshSourceSwitchDialog({
  state,
  busy,
  cancelRef,
  onChoice,
  onDismiss,
}: DshSourceSwitchDialogProps) {
  const { t } = useTCopy();
  const sourceStatus = useAppStore((s) => s.sourceStatus);
  if (!state) {
    return null;
  }

  const targetLabel =
    state.mode === 'system'
      ? t.dshVersionSourceSystem
      : state.mode === 'host'
        ? t.dshVersionSourceHost
        : t.dshVersionSourceAuto;
  const title =
    state.mode === 'system'
      ? t.dshVersionSourceSystemDialogTitle
      : t.dshVersionSourceSwitchDialogTitle;

  return createPortal(
    <div
      className="adl-confirm-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={busy ? undefined : onDismiss}
    >
      <div className="adl-confirm-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="adl-confirm-dialog__header">
          <h3 className="adl-confirm-dialog__title">{title}</h3>
        </div>
        <div className="adl-confirm-dialog__body">
          <p className="adl-confirm-dialog__message adl-dsh-source-dialog__message">
            {state.fromEmpty
              ? t.dshVersionSourceSwitchDialogFromEmpty.replaceAll('{target}', targetLabel)
              : state.mode === 'system'
                ? t.dshVersionSourceSystemDialogMessage.replace(
                    '{path}',
                    sourceStatus?.system?.path ?? '',
                  )
                : t.dshVersionSourceSwitchDialogMessage.replaceAll('{target}', targetLabel)}
          </p>
          {state.targetEmpty ? (
            <p className="adl-confirm-dialog__message adl-dsh-source-dialog__message adl-dsh-source-dialog__message--warn">
              {t.dshVersionSourceSwitchDialogEmpty.replaceAll('{target}', targetLabel)}
            </p>
          ) : null}
        </div>
        <div className="adl-confirm-dialog__footer">
          <button
            ref={cancelRef}
            type="button"
            className="adl-btn adl-btn--secondary"
            disabled={busy}
            onClick={() => onChoice('cancel')}
          >
            {t.cancel}
          </button>
          {/* 次选项为同步记 pending（无异步过程），busy 仅禁用不转圈。 */}
          <button
            type="button"
            className="adl-btn adl-btn--secondary"
            disabled={busy}
            onClick={() => onChoice('next')}
          >
            {t.dshVersionSourceApplyNextLaunch}
          </button>
          <button
            type="button"
            className="adl-btn adl-btn--secondary"
            disabled={busy}
            onClick={() => onChoice('now')}
            aria-label={busy ? t.dshVersionSourceApplyNow : undefined}
          >
            {busy ? <Spinner size="sm" speed="normal" /> : t.dshVersionSourceApplyNow}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
