import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { useAppActions } from '@hooks/useAppActions';

/**
 * 关闭 dsh 时的选择对话框。
 * - 保留进程：dsh 后台继续跑，会话延续，重进秒开。
 * - 彻底退出：停 dsh 进程，重进需重启。
 * - 取消：关闭对话框，保持 dsh 当前状态。
 */
export function CloseDshDialog() {
  const { t } = useTCopy();
  const actions = useAppActions();
  const visible = useAppStore((s) => s.closeDialogVisible);
  const keepRef = useRef<HTMLButtonElement | null>(null);

  const handleCancel = () => actions.setDshCloseDialogVisible(false);
  const handleKeep = () => void actions.closeDsh(true);
  const handleTerminate = () => void actions.closeDsh(false);

  useEffect(() => {
    if (!visible) {
      return;
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        event.preventDefault();
        handleCancel();
      }
    };
    window.addEventListener('keydown', handleEscape, true);
    keepRef.current?.focus();
    return () => window.removeEventListener('keydown', handleEscape, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) {
    return null;
  }

  return createPortal(
    <div
      className="adl-confirm-overlay"
      onClick={handleCancel}
      role="dialog"
      aria-modal="true"
      aria-label={t.dshCloseDialogTitle}
    >
      <div className="adl-confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="adl-confirm-dialog__header">
          <h3 className="adl-confirm-dialog__title">{t.dshCloseDialogTitle}</h3>
        </div>
        <div className="adl-confirm-dialog__body">
          <p className="adl-confirm-dialog__message">{t.dshCloseDialogDesc}</p>
        </div>
        <div className="adl-confirm-dialog__footer adl-confirm-dialog__footer--stacked">
          <button ref={keepRef} type="button" className="adl-btn adl-btn--primary" onClick={handleKeep}>
            {t.dshCloseKeep}
          </button>
          <button type="button" className="adl-btn adl-btn--danger" onClick={handleTerminate}>
            {t.dshCloseTerminate}
          </button>
          <button type="button" className="adl-btn adl-btn--secondary" onClick={handleCancel}>
            {t.dshCloseCancel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}