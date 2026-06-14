import { useLayoutEffect, useState } from 'react';

interface PositionState {
  left: number;
  top: number;
  side: 'right' | 'left';
}

function computePosition(
  triggerRect: DOMRect,
  tooltipWidth: number,
  tooltipHeight: number
): PositionState {
  const offset = 4;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const padding = 4;
  let side: 'right' | 'left' = 'right';
  const rightPos = triggerRect.right + offset;
  if (rightPos + tooltipWidth > viewportW - padding) {
    side = 'left';
  }
  let left: number;
  if (side === 'right') {
    left = rightPos;
    if (left < padding) {
      left = padding;
    }
  } else {
    left = triggerRect.left - tooltipWidth - offset;
    if (left < padding) {
      left = padding;
    }
  }
  let top = triggerRect.top;
  if (top + tooltipHeight > viewportH - padding) {
    top = viewportH - tooltipHeight - padding;
  }
  if (top < padding) {
    top = padding;
  }
  return { left, top, side };
}

export function useFoldTooltipPosition(
  anchorRect: DOMRect | null,
  tooltipRef: React.RefObject<HTMLDivElement | null>
): { left: number; top: number; side: 'right' | 'left' } | null {
  const [position, setPosition] = useState<PositionState | null>(null);

  useLayoutEffect(() => {
    if (!anchorRect || !tooltipRef.current) {
      return;
    }
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    setPosition(computePosition(anchorRect, tooltipRect.width, tooltipRect.height));
  }, [anchorRect, tooltipRef]);

  return position;
}
