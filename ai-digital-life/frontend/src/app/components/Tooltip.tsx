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

interface TooltipContextValue extends UseTooltipReturn {
  dismissible: boolean;
  showArrow: boolean;
}

const TooltipContext = createContext<TooltipContextValue | null>(null);

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
  showArrow?: boolean;
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
  showArrow = true,
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
    maxWidth,
  });

  const contextValue = useMemo<TooltipContextValue>(
    () => ({
      ...tooltip,
      dismissible,
      showArrow,
    }),
    [tooltip, dismissible, showArrow],
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
      const childRef = (childProps.ref as React.Ref<HTMLElement> | undefined) ?? undefined;
      props.ref = (node: HTMLElement | null) => {
        if (typeof childRef === 'function') {
          childRef(node);
        } else if (childRef && typeof childRef === 'object') {
          (childRef as React.MutableRefObject<HTMLElement | null>).current = node;
        }
      };
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
      const existingRef = existingRefContainer.current;
      if (typeof existingRef === 'function') {
        existingRef(node);
      } else if (existingRef && typeof existingRef === 'object') {
        (existingRef as React.MutableRefObject<HTMLElement | null>).current = node;
      }
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
  tooltipRef,
  close,
  handleTooltipEnter,
  handleTooltipLeave,
  dismissible,
  showArrow,
  className,
  id,
}: {
  children: React.ReactNode;
  side?: Placement;
  placement: Placement;
  position: PositionResult | null;
  isOpen: boolean;
  tooltipRef: React.RefCallback<HTMLElement>;
  close: () => void;
  handleTooltipEnter: () => void;
  handleTooltipLeave: () => void;
  dismissible: boolean;
  showArrow: boolean;
  className?: string;
  id?: string;
}) {
  const effectiveSide = side ?? placement;

  const isOffscreen = !position || !isOpen;
  const left = isOffscreen ? -9999 : position.x;
  const top = isOffscreen ? -9999 : position.y;

  const content = (
    <div
      role="tooltip"
      id={id}
      data-state={isOpen ? 'open' : 'closed'}
      data-side={effectiveSide}
      data-testid="tooltip-content"
      ref={tooltipRef}
      className={`tooltip ${className ?? ''}`}
      style={{
        position: 'fixed',
        left,
        top,
        pointerEvents: isOpen ? 'auto' : 'none',
      }}
      onMouseEnter={handleTooltipEnter}
      onMouseLeave={handleTooltipLeave}
    >
      {showArrow && position && (
        <span
          className="tooltip__arrow"
          style={{
            left: position.arrowX !== null ? `${position.arrowX}px` : undefined,
            top: position.arrowY !== null ? `${position.arrowY}px` : undefined,
          }}
        />
      )}
      <span className="tooltip__content">{children}</span>
      {dismissible && (
        <button
          type="button"
          className="tooltip__close"
          aria-label="Close"
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
    placement,
    close,
    handleTooltipEnter,
    handleTooltipLeave,
    dismissible,
    showArrow,
  } = useTooltipContext();

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (isOpen && !mounted) {
      requestAnimationFrame(() => setMounted(true));
    }
  }, [isOpen, mounted]);

  useEffect(() => {
    if (!isOpen && mounted) {
      const timer = setTimeout(() => setMounted(false), 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen, mounted]);

  if (!isOpen && !mounted) {
    return null;
  }

  return (
    <TooltipContentInner
      side={side}
      placement={placement}
      position={position}
      isOpen={isOpen}
      tooltipRef={tooltipRef}
      close={close}
      handleTooltipEnter={handleTooltipEnter}
      handleTooltipLeave={handleTooltipLeave}
      dismissible={dismissible}
      showArrow={showArrow}
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
  showArrow?: boolean;
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
  showArrow,
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
      showArrow={showArrow}
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
