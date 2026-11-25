import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { renderIcon, type IconName } from '../../design-system/icons';

export type ToastType = 'success' | 'warning' | 'error';

interface ToastProps {
  message: string;
  type?: ToastType;
  /** 自动收起毫秒数；`<= 0` 表示常驻，由调用方 `removeToast` 收起。 */
  duration?: number;
  position?: number;
  /** 加载型 toast：文字使用项目统一的扫光效果。 */
  shimmer?: boolean;
  onClose: () => void;
}

export interface ToastData {
  id: string;
  message: string;
  type?: ToastType;
  source?: string;
  /** 自动收起毫秒数；`<= 0` 表示常驻（加载型 toast 用）。 */
  duration?: number;
  /** 加载型 toast：文字扫光（与加载行/按钮忙碌态同一套 keyframes）。 */
  shimmer?: boolean;
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
  shimmer = false,
  onClose,
}: ToastProps) {
  const [isVisible, setIsVisible] = useState(false);
  // onClose 经 ToastContainer 内联传递，每次父渲染身份都变；若直接入 deps，
  // 任意 store 更新触发的重渲染都会清掉计时器重走（toast 常驻 + 入场动画反复跳动）。
  // 经 ref 解耦：计时器只按 duration 跑，关闭时读最新回调。
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));

    // 加载型 toast（duration<=0）常驻：目标标签页打开后由调用方 removeToast 收起，
    // 避免「恢复还没完成、提示先消失」或长任务被固定超时截断。
    if (duration <= 0) {
      return;
    }

    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    const timer = setTimeout(() => {
      setIsVisible(false);
      hideTimer = setTimeout(() => onCloseRef.current(), 300);
    }, duration);

    return () => {
      clearTimeout(timer);
      if (hideTimer !== null) {
        clearTimeout(hideTimer);
      }
    };
  }, [duration]);

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
      <span className={`adl-toast__message${shimmer ? ' adl-toast__message--shimmer' : ''}`}>
        {message}
      </span>
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
          shimmer={toast.shimmer}
          position={positionMap.get(toast.id)}
          onClose={() => onRemove(toast.id)}
        />
      ))}
    </>
  );
}
