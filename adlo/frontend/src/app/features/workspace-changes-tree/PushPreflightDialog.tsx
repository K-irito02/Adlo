import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { CopyDict } from '@i18n';

export interface PushPreflightDialogProps {
  open: boolean;
  /** 工作区是否有未提交变更（staged/unstaged/untracked/conflicts）。 */
  dirty: boolean;
  /** 当前分支是否已有 upstream。 */
  hasUpstream: boolean;
  branch: string;
  t: CopyDict;
  onCancel: () => void;
  /** 不提交，直接推送当前分支已有提交。 */
  onPushOnly: () => void;
  /** 打开 CommitDialog，提交成功后继续推送。 */
  onCommitAndPush: () => void;
}

/**
 * 推送预检：把「有未提交变更」与「没有 upstream」合并成一次确认，
 * 避免连续弹两个框；取消时什么都不做。
 */
export function PushPreflightDialog({
  open,
  dirty,
  hasUpstream,
  branch,
  t,
  onCancel,
  onPushOnly,
  onCommitAndPush,
}: PushPreflightDialogProps) {
  const primaryRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    primaryRef.current?.focus();
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeydown, true);
    return () => window.removeEventListener('keydown', handleKeydown, true);
  }, [open, onCancel]);

  if (!open) {
    return null;
  }

  const primaryLabel = dirty ? t.changesCommitAndPush : t.changesPushAndSetUpstream;

  return createPortal(
    <div
      className="adl-confirm-overlay"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={t.changesPushPreflightTitle as string}
    >
      <div className="adl-confirm-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="adl-confirm-dialog__header">
          <h3 className="adl-confirm-dialog__title">{t.changesPushPreflightTitle}</h3>
        </div>
        <div className="adl-confirm-dialog__body">
          <p className="adl-confirm-dialog__message">
            {dirty
              ? t.changesPushDirtyNotice
              : (t.changesPushConfirmNotice as string).replace('{branch}', branch)}
          </p>
          {!hasUpstream ? (
            <p className="adl-push-preflight__notice">{t.changesPushNoUpstreamNotice}</p>
          ) : null}
        </div>
        <div className="adl-confirm-dialog__footer">
          <button type="button" className="adl-btn adl-btn--neutral-soft" onClick={onCancel}>
            {t.cancel}
          </button>
          {dirty ? (
            <button type="button" className="adl-btn adl-btn--secondary" onClick={onPushOnly}>
              {t.changesPushOnly}
            </button>
          ) : null}
          <button
            ref={primaryRef}
            type="button"
            className="adl-btn adl-btn--primary-soft"
            onClick={dirty ? onCommitAndPush : onPushOnly}
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
