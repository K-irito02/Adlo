import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTCopy } from '@i18n/useTCopy';
import { IconClose } from '../../icons';

interface AboutTextDialogProps {
  title: string;
  subtitle?: string;
  /** 许可全文用宽版（等宽正文在窄框里会频繁硬折行）。 */
  wide?: boolean;
  /** 常驻底部说明：不随正文滚动，始终可见。 */
  footer?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

/**
 * 「关于」的只读文本弹窗（许可 / 致谢 / 第三方声明共用外壳）。
 *
 * 与 ConfirmDialog 的区别：正文可能很长（MIT 全文 / 全量依赖清单），因此做成可滚动正文 +
 * 无底部按钮行，只有右上角关闭键；可选 `footer` 固定在正文下方，不随滚动消失。
 * 语义仍是模态框（与 ConfirmDialog 同一套契约）：
 * Portal 到 body、Escape 关闭、遮罩点击关闭、Tab/Shift+Tab 在框内环绕（焦点不逃逸）、
 * 打开时焦点进关闭键、关闭后归还焦点。
 */
export function AboutTextDialog({
  title,
  subtitle,
  wide,
  footer,
  onClose,
  children,
}: AboutTextDialogProps) {
  const { t } = useTCopy();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') {
        return;
      }
      const dialog = dialogRef.current;
      if (!dialog) {
        return;
      }
      const focusables = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary:not([aria-disabled="true"]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusables.length === 0) {
        return;
      }
      event.preventDefault();
      const current = document.activeElement as HTMLElement | null;
      const index = current ? focusables.indexOf(current) : -1;
      const step = event.shiftKey ? -1 : 1;
      const next =
        index === -1
          ? event.shiftKey
            ? focusables.length - 1
            : 0
          : (index + step + focusables.length) % focusables.length;
      focusables[next].focus();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      previousFocusRef.current?.focus();
    };
  }, [onClose]);

  return createPortal(
    <div
      className="adl-about-dialog-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        className={`adl-about-dialog${wide ? ' adl-about-dialog--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="adl-about-dialog__head">
          <div>
            <h2 className="adl-about-dialog__title" id={titleId}>
              {title}
            </h2>
            {subtitle ? <p className="adl-about-dialog__subtitle">{subtitle}</p> : null}
          </div>
          <button
            ref={closeRef}
            type="button"
            className="adl-about-dialog__close"
            aria-label={t.close}
            title={t.close}
            onClick={onClose}
          >
            <IconClose size={14} decorative />
          </button>
        </div>
        <div className="adl-about-dialog__body">{children}</div>
        {footer ? <div className="adl-about-dialog__foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
