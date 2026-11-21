import { useEffect, useRef, type RefObject } from 'react';

/** 对话框内可聚焦控件（与 ConfirmDialog 历史实现一致）。 */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 模态对话框的最小键盘契约：
 * - Escape 取消（捕获阶段，避免被下层处理器抢走）；
 * - Tab / Shift+Tab 在对话框内可聚焦控件间环绕，兑现 `aria-modal` 契约，
 *   焦点不得逃逸到遮罩下的工作区列表/菜单。
 *
 * 返回的 ref 必须挂到对话框内容容器上（焦点范围以它为准，不含遮罩）。
 */
export function useDialogFocusTrap(
  open: boolean,
  onEscape: () => void,
  initialFocusRef?: RefObject<HTMLElement | null>,
): RefObject<HTMLDivElement | null> {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        event.preventDefault();
        onEscape();
        return;
      }
      if (event.key === 'Tab') {
        const dialog = dialogRef.current;
        if (!dialog) {
          return;
        }
        const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
        if (focusables.length === 0) {
          return;
        }
        event.preventDefault();
        const current = document.activeElement as HTMLElement | null;
        const idx = current ? focusables.indexOf(current) : -1;
        const step = event.shiftKey ? -1 : 1;
        const next =
          idx === -1
            ? event.shiftKey
              ? focusables.length - 1
              : 0
            : (idx + step + focusables.length) % focusables.length;
        focusables[next].focus();
      }
    };
    window.addEventListener('keydown', handleKeydown, true);
    initialFocusRef?.current?.focus();
    return () => window.removeEventListener('keydown', handleKeydown, true);
  }, [open, onEscape, initialFocusRef]);

  return dialogRef;
}
