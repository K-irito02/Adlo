import { useRef, useState, useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { computePosition, type Placement, type HintCardPositionResult } from './hintCardPosition';

export interface HintCardProps {
  visible: boolean;
  triggerRect: DOMRect | null;
  placement?: Placement;
  forcePlacement?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  children: React.ReactNode;
}

function parseContent(content: React.ReactNode): React.ReactNode {
  if (typeof content !== 'string') {
    return content;
  }

  const lines = content.split('\n');
  return lines.map((line, idx) => {
    if (line.startsWith('· ')) {
      return (
        <div key={idx} className="hint-card__bullet-line">
          <span className="hint-card__bullet">·</span>
          <span className="hint-card__bullet-text">{line.slice(2)}</span>
        </div>
      );
    }
    if (line === '') {
      return idx !== lines.length - 1 ? <br key={idx} /> : null;
    }
    return (
      <div key={idx} className="hint-card__line">
        {line}
      </div>
    );
  });
}

export function HintCard({
  visible,
  triggerRect,
  placement = 'auto',
  forcePlacement = false,
  onMouseEnter,
  onMouseLeave,
  children,
}: HintCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<HintCardPositionResult | null>(null);

  const recompute = useCallback(() => {
    if (!triggerRect || !cardRef.current) {
      return;
    }
    const cardRect = cardRef.current.getBoundingClientRect();
    const effectivePlacement = forcePlacement
      ? placement === 'auto'
        ? 'right'
        : placement
      : placement;
    const result = computePosition({
      triggerRect,
      cardWidth: cardRect.width,
      cardHeight: cardRect.height,
      placement: effectivePlacement,
    });
    setPos(result);
  }, [triggerRect, placement, forcePlacement]);

  useLayoutEffect(() => {
    if (visible && triggerRect) {
      recompute();
    } else {
      setPos(null);
    }
  }, [visible, triggerRect, recompute]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    const onResize = () => recompute();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [visible, recompute]);

  const content = useMemo(() => parseContent(children), [children]);

  if (!visible) {
    return null;
  }

  return createPortal(
    <>
      <div
        ref={cardRef}
        className="hint-card"
        data-placement={pos?.placement}
        data-state={pos ? 'open' : 'measuring'}
        style={
          pos
            ? { left: pos.card.left, top: pos.card.top }
            : { visibility: 'hidden', position: 'fixed' }
        }
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {content}
      </div>
      {pos && (
        <>
          <div
            className="hint-card__arrow"
            data-placement={pos.placement}
            style={{ left: pos.arrow.left, top: pos.arrow.top }}
          />
          <div
            className="hint-card__arrow-border"
            data-placement={pos.placement}
            style={{ left: pos.arrowBorder.left, top: pos.arrowBorder.top }}
          />
        </>
      )}
    </>,
    document.body,
  );
}
