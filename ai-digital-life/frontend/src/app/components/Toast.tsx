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

export interface ToastData {
  id: string;
  message: string;
  type?: ToastType;
  source?: string;
  duration?: number;
}

const TOAST_BASE_TOP = 24;
const TOAST_HEIGHT = 36;
const TOAST_GAP = 8;

const TOAST_ICONS: Record<ToastType, IconName> = {
  success: 'check-circle',
  warning: 'alert-triangle',
  error: 'x-circle',
};

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

    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    const timer = setTimeout(() => {
      setIsVisible(false);
      hideTimer = setTimeout(onClose, 300);
    }, duration);

    return () => {
      clearTimeout(timer);
      if (hideTimer !== null) {
        clearTimeout(hideTimer);
      }
    };
  }, [duration, onClose]);

  const iconHtml = renderIcon(TOAST_ICONS[type], { size: 'sm', decorative: true }).value;
  const top = TOAST_BASE_TOP + position * (TOAST_HEIGHT + TOAST_GAP);

  return createPortal(
    <div
      className={`adl-toast adl-toast--${type}${isVisible ? ' adl-toast--visible' : ''}`}
      style={{ top: `${top}px` }}
      role="alert"
      aria-live="polite"
    >
      <span className="adl-toast__icon" dangerouslySetInnerHTML={{ __html: iconHtml }} />
      <span className="adl-toast__message">{message}</span>
    </div>,
    document.body,
  );
}

interface ToastContainerProps {
  toasts: ToastData[];
  onRemove: (id: string) => void;
}

function computeToastPositions(toasts: ToastData[]): Map<string, number> {
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
          duration={toast.duration}
          position={positionMap.get(toast.id)}
          onClose={() => onRemove(toast.id)}
        />
      ))}
    </>
  );
}
