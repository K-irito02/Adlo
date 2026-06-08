import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { renderIcon, type IconName } from '../../design-system/icons';

export type ToastType = 'success' | 'warning' | 'error';

interface ToastProps {
  message: string;
  type?: ToastType;
  duration?: number;
  position?: number;
  onClose: () => void;
}

interface ToastData {
  id: string;
  message: string;
  type?: ToastType;
  source?: string;
}

const TOAST_BASE_TOP = 24;
const TOAST_HEIGHT = 40;
const TOAST_GAP = 8;

const TOAST_ICONS: Record<ToastType, IconName> = {
  success: 'check-circle',
  warning: 'check-circle',
  error: 'x-circle',
};

// 自定义圆形警告图标 SVG（圆形里带感叹号）
const WARNING_ICON_SVG =
  '<svg class="adl-toast__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';

export function Toast({
  message,
  type = 'warning',
  duration = 3000,
  position = 0,
  onClose,
}: ToastProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));

    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const iconHtml =
    type === 'warning'
      ? WARNING_ICON_SVG
      : renderIcon(TOAST_ICONS[type], { size: 'sm', decorative: true }).value;
  const top = TOAST_BASE_TOP + position * (TOAST_HEIGHT + TOAST_GAP);

  return createPortal(
    <div
      className={`adl-toast adl-toast--${type}${isVisible ? ' adl-toast--visible' : ''}`}
      style={{ top: `${top}px` }}
      role="alert"
      aria-live="polite"
    >
      <span dangerouslySetInnerHTML={{ __html: iconHtml }} />
      <span className="adl-toast__message">{message}</span>
    </div>,
    document.body
  );
}

interface ToastContainerProps {
  toasts: Array<ToastData>;
  onRemove: (id: string) => void;
}

function computeToastPositions(toasts: Array<ToastData>): Map<string, number> {
  const positionMap = new Map<string, number>();
  const sourceToPosition = new Map<string, number>();
  let position = 0;

  for (const toast of toasts) {
    const source = toast.source || '';
    if (sourceToPosition.has(source)) {
      positionMap.set(toast.id, sourceToPosition.get(source)!);
    } else {
      sourceToPosition.set(source, position);
      positionMap.set(toast.id, position);
      position++;
    }
  }

  return positionMap;
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  const positionMap = computeToastPositions(toasts);
  return (
    <>
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          position={positionMap.get(toast.id)}
          onClose={() => onRemove(toast.id)}
        />
      ))}
    </>
  );
}
