import React from 'react';
import { createPortal } from 'react-dom';

interface FoldTooltipContentProps {
  text: string | null;
  position: { left: number; top: number; side: 'right' | 'left' } | null;
  tooltipRef: React.RefObject<HTMLDivElement | null>;
}

export const FoldTooltipContent = React.memo(function FoldTooltipContent({
  text,
  position,
  tooltipRef,
}: FoldTooltipContentProps) {
  const isVisible = text !== null && position !== null;
  const side = position?.side ?? 'right';
  const style: React.CSSProperties = position
    ? { position: 'fixed', left: position.left, top: position.top }
    : { position: 'fixed', left: -9999, top: -9999, visibility: 'hidden' };

  return createPortal(
    <div
      ref={tooltipRef}
      role="tooltip"
      data-state={isVisible ? 'open' : 'closed'}
      data-side={side}
      className="tooltip"
      style={style}
    >
      <span className="tooltip__content">{text}</span>
    </div>,
    document.body,
  );
});
