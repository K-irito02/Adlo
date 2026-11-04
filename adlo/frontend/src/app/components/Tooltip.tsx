import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  memo,
} from 'react';
import { createPortal } from 'react-dom';
import type { Placement, Alignment, PositionResult } from '../utils/tooltipPosition';
import { useTooltip, type UseTooltipOptions, type UseTooltipReturn } from '../hooks/useTooltip';
import { TCopyContext } from '../i18n/TCopyContext';

// 退出卸载延迟（ms）：必须 ≥ CSS 退出过渡时长（tooltip.css closed 态），
// 否则退出动画被提前掐断。改 CSS 时长时同步此处。
export const TOOLTIP_EXIT_MS = 200;

interface TooltipContextValue extends UseTooltipReturn {
  dismissible: boolean;
  maxWidth: number;
}

const TooltipContext = createContext<TooltipContextValue | null>(null);

function forwardRefValue(
  existingRef: React.Ref<HTMLElement> | undefined,
  node: HTMLElement | null,
): void {
  if (typeof existingRef === 'function') {
    existingRef(node);
  } else if (existingRef && typeof existingRef === 'object') {
    (existingRef as React.MutableRefObject<HTMLElement | null>).current = node;
  }
}

function useTooltipContext(): TooltipContextValue {
  const ctx = useContext(TooltipContext);
  if (!ctx) {
    throw new Error('Tooltip components must be used within a <Tooltip> provider');
  }
  return ctx;
}

export interface TooltipProps {
  children: React.ReactNode;
  defaultPlacement?: Placement;
  trigger?: UseTooltipOptions['trigger'];
  showDelay?: number;
  hideDelay?: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  maxWidth?: number;
  sideOffset?: number;
  align?: Alignment;
  dismissible?: boolean;
}

export function Tooltip({
  children,
  defaultPlacement = 'top',
  trigger = 'hover',
  showDelay,
  hideDelay,
  open,
  onOpenChange,
  maxWidth = 240,
  sideOffset,
  align = 'center',
  dismissible = false,
}: TooltipProps) {
  const tooltip = useTooltip({
    trigger,
    defaultPlacement,
    showDelay,
    hideDelay,
    open,
    onOpenChange,
    sideOffset,
    align,
  });

  const contextValue = useMemo<TooltipContextValue>(
    () => ({
      ...tooltip,
      dismissible,
      maxWidth,
    }),
    [tooltip, dismissible, maxWidth],
  );

  return <TooltipContext.Provider value={contextValue}>{children}</TooltipContext.Provider>;
}

export interface TooltipTriggerProps {
  children: React.ReactNode;
  asChild?: boolean;
}

export function TooltipTrigger({ children, asChild = false }: TooltipTriggerProps) {
  const {
    triggerRef,
    handleTriggerEnter,
    handleTriggerLeave,
    handleTriggerFocus,
    handleTriggerBlur,
    handleClick,
  } = useTooltipContext();

  const child = React.Children.only(children) as React.ReactElement<Record<string, unknown>>;

  const childProps = child.props as Record<string, unknown>;

  const nativeChildRef = useRef<React.Ref<HTMLElement> | undefined>(undefined);
  nativeChildRef.current = childProps.ref as React.Ref<HTMLElement> | undefined;
  const nativeRef = useCallback((node: HTMLElement | null) => {
    forwardRefValue(nativeChildRef.current, node);
  }, []);

  const mergedProps = useMemo(() => {
    const props: Record<string, unknown> = {
      onMouseEnter: (e: React.MouseEvent) => {
        handleTriggerEnter();
        (childProps.onMouseEnter as (e: React.MouseEvent) => void)?.(e);
      },
      onMouseLeave: (e: React.MouseEvent) => {
        handleTriggerLeave();
        (childProps.onMouseLeave as (e: React.MouseEvent) => void)?.(e);
      },
      onFocus: (e: React.FocusEvent) => {
        handleTriggerFocus();
        (childProps.onFocus as (e: React.FocusEvent) => void)?.(e);
      },
      onBlur: (e: React.FocusEvent) => {
        handleTriggerBlur();
        (childProps.onBlur as (e: React.FocusEvent) => void)?.(e);
      },
      onClick: (e: React.MouseEvent) => {
        handleClick(e);
        (childProps.onClick as (e: React.MouseEvent) => void)?.(e);
      },
    };

    if (typeof child.type === 'string') {
      props.ref = nativeRef;
    }

    return props;
  }, [
    childProps,
    child.type,
    handleTriggerEnter,
    handleTriggerLeave,
    handleTriggerFocus,
    handleTriggerBlur,
    handleClick,
    nativeRef,
  ]);

  const asChildActive = asChild && typeof child.type !== 'string';
  const existingRefContainer = useRef<React.Ref<HTMLElement> | undefined>(undefined);

  useEffect(() => {
    existingRefContainer.current = asChildActive
      ? ((child.props as Record<string, unknown>).ref as React.Ref<HTMLElement> | undefined)
      : undefined;
  }, [asChildActive, child]);

  const mergedRef = useCallback(
    (node: HTMLElement | null) => {
      forwardRefValue(existingRefContainer.current, node);
      triggerRef(node);
    },
    [triggerRef],
  );

  if (asChildActive) {
    return React.cloneElement(child, { ...mergedProps, ref: mergedRef } as Record<string, unknown>);
  }

  return (
    <span ref={triggerRef} className="tooltip-trigger" style={{ display: 'inline-flex' }}>
      {React.cloneElement(child, mergedProps)}
    </span>
  );
}

export interface TooltipContentProps {
  children: React.ReactNode;
  side?: Placement;
  align?: Alignment;
  sideOffset?: number;
  className?: string;
  id?: string;
}

const TooltipContentInner = memo(function TooltipContentInner({
  children,
  side,
  placement,
  position,
  isOpen,
  entered,
  tooltipRef,
  close,
  handleTooltipEnter,
  handleTooltipLeave,
  dismissible,
  maxWidth,
  closeLabel,
  className,
  id,
}: {
  children: React.ReactNode;
  side?: Placement;
  placement: Placement;
  position: PositionResult | null;
  isOpen: boolean;
  entered: boolean;
  closeLabel: string;
  tooltipRef: React.RefCallback<HTMLElement>;
  close: () => void;
  handleTooltipEnter: () => void;
  handleTooltipLeave: () => void;
  dismissible: boolean;
  maxWidth: number;
  className?: string;
  id?: string;
}) {
  const effectiveSide = side ?? placement;

  // 仅 position 为空才移出画面：退出过渡（isOpen=false 但仍挂载）必须留在原地播放，
  // 否则淡出会在屏外空播、用户看到瞬间消失。
  const isOffscreen = !position;
  const left = isOffscreen ? -9999 : position.x;
  const top = isOffscreen ? -9999 : position.y;

  const content = (
    <div
      role="tooltip"
      id={id}
      data-state={isOpen && entered ? 'open' : 'closed'}
      data-side={effectiveSide}
      data-testid="tooltip-content"
      ref={tooltipRef}
      className={`tooltip ${className ?? ''}`}
      style={{
        position: 'fixed',
        left,
        top,
        maxWidth,
        pointerEvents: isOpen ? 'auto' : 'none',
      }}
      onMouseEnter={handleTooltipEnter}
      onMouseLeave={handleTooltipLeave}
    >
      <span className="tooltip__content">{children}</span>
      {dismissible && (
        <button
          type="button"
          className="tooltip__close"
          aria-label={closeLabel}
          onClick={(e) => {
            e.stopPropagation();
            close();
          }}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M1 1L9 9M9 1L1 9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </div>
  );

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(content, document.body);
});

export function TooltipContent({
  children,
  side,
  align: _contentAlign,
  sideOffset: _contentSideOffset,
  className,
  id,
}: TooltipContentProps) {
  const {
    tooltipRef,
    isOpen,
    position,
    resetPosition,
    placement,
    close,
    handleTooltipEnter,
    handleTooltipLeave,
    dismissible,
    maxWidth,
  } = useTooltipContext();

  // dismiss 关闭按钮文案走 i18n（t.close 中英字典均有，tsc 会校验存在性）。
  // 无 provider（无 TCopy 的隔离单测）时回退英文，该分支生产不可达。
  const copyCtx = useContext(TCopyContext);
  const closeLabel = copyCtx?.t.close ?? 'Close';

  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (isOpen && !mounted) {
      const id = requestAnimationFrame(() => setMounted(true));
      return () => cancelAnimationFrame(id);
    }
  }, [isOpen, mounted]);

  // Enter transition needs a closed→open flip on separate frames:
  // mounting directly in open state skips the CSS transition entirely.
  useEffect(() => {
    if (isOpen && mounted) {
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setEntered(true));
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }
    setEntered(false);
  }, [isOpen, mounted]);

  useEffect(() => {
    if (!isOpen && mounted) {
      // 退出过渡播完才卸载；卸载同时清空调位，避免下次打开首帧旧址闪现。
      const timer = setTimeout(() => {
        setMounted(false);
        resetPosition();
      }, TOOLTIP_EXIT_MS);
      return () => clearTimeout(timer);
    }
  }, [isOpen, mounted, resetPosition]);

  if (!isOpen && !mounted) {
    return null;
  }

  return (
    <TooltipContentInner
      side={side}
      placement={placement}
      position={position}
      isOpen={isOpen}
      entered={entered}
      tooltipRef={tooltipRef}
      close={close}
      handleTooltipEnter={handleTooltipEnter}
      handleTooltipLeave={handleTooltipLeave}
      dismissible={dismissible}
      maxWidth={maxWidth}
      closeLabel={closeLabel}
      className={className}
      id={id}
    >
      {children}
    </TooltipContentInner>
  );
}

export interface TooltipSimpleProps {
  content: React.ReactNode;
  children: React.ReactNode;
  placement?: Placement;
  align?: Alignment;
  sideOffset?: number;
  showDelay?: number;
  hideDelay?: number;
  trigger?: UseTooltipOptions['trigger'];
  dismissible?: boolean;
  maxWidth?: number;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  id?: string;
}

export function TooltipSimple({
  content,
  children,
  placement,
  align,
  sideOffset,
  showDelay,
  hideDelay,
  trigger,
  dismissible,
  maxWidth,
  className,
  open,
  onOpenChange,
  id,
}: TooltipSimpleProps) {
  return (
    <Tooltip
      defaultPlacement={placement}
      trigger={trigger}
      showDelay={showDelay}
      hideDelay={hideDelay}
      dismissible={dismissible}
      maxWidth={maxWidth}
      open={open}
      onOpenChange={onOpenChange}
      align={align}
      sideOffset={sideOffset}
    >
      <TooltipTrigger>{children}</TooltipTrigger>
      <TooltipContent className={className} id={id}>
        {content}
      </TooltipContent>
    </Tooltip>
  );
}

export default Tooltip;
