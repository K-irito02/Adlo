export type Placement = 'auto' | 'top' | 'right' | 'bottom' | 'left';

export interface HintCardPositionOptions {
  triggerRect: DOMRect;
  cardWidth: number;
  cardHeight: number;
  placement?: Placement;
  viewportMargin?: number;
  gap?: number;
}

export interface HintCardPositionResult {
  card: { left: number; top: number };
  arrow: { left: number; top: number };
  arrowBorder: { left: number; top: number };
  placement: Placement;
}

const GAP = 5;
const VIEWPORT_MARGIN = 4;
const ARROW_FILL_HALF = 4;
const ARROW_BORDER_HALF = 5;
const ARROW_FILL_H = 5;
const ARROW_OVERLAP = 2;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

function anchorXInCard(cx: number, cardLeft: number, cardW: number): number {
  if (cardW <= 0) {
    return cx;
  }
  const lo = cardLeft + ARROW_BORDER_HALF;
  const hi = cardLeft + cardW - ARROW_BORDER_HALF;
  if (hi <= lo) {
    return cx;
  }
  return clamp(cx, lo, hi);
}

function calcForPlacement(
  triggerRect: DOMRect,
  cardW: number,
  cardH: number,
  placement: Placement,
  vw: number,
  vh: number,
  margin: number,
  gap: number,
): HintCardPositionResult | null {
  const cx = triggerRect.left + triggerRect.width / 2;
  const cy = triggerRect.top + triggerRect.height / 2;

  let cardLeft: number;
  let cardTop: number;

  switch (placement) {
    case 'top':
      cardLeft = clamp(cx - cardW / 2, margin, vw - cardW - margin);
      cardTop = triggerRect.top - cardH - gap;
      break;
    case 'bottom':
      cardLeft = clamp(cx - cardW / 2, margin, vw - cardW - margin);
      cardTop = triggerRect.bottom + gap;
      break;
    case 'left':
      cardLeft = triggerRect.left - cardW - gap;
      cardTop = clamp(cy - cardH / 2, margin, vh - cardH - margin);
      break;
    case 'right':
      cardLeft = triggerRect.right + gap;
      cardTop = clamp(cy - cardH / 2, margin, vh - cardH - margin);
      break;
    default:
      return null;
  }

  // 检查是否在视口内
  if (cardLeft < margin || cardLeft + cardW > vw - margin) {
    return null;
  }
  if (cardTop < margin || cardTop + cardH > vh - margin) {
    return null;
  }

  return buildResult(triggerRect, cardLeft, cardTop, cardW, cardH, placement);
}

function buildResult(
  triggerRect: DOMRect,
  cardLeft: number,
  cardTop: number,
  cardW: number,
  cardH: number,
  placement: Placement,
): HintCardPositionResult {
  const cx = triggerRect.left + triggerRect.width / 2;
  const cy = triggerRect.top + triggerRect.height / 2;

  let anchorX: number;
  let anchorY: number;

  if (placement === 'top' || placement === 'bottom') {
    anchorX = anchorXInCard(cx, cardLeft, cardW);
    anchorY = placement === 'top' ? cardTop + cardH : cardTop;
  } else {
    anchorX = placement === 'left' ? cardLeft + cardW : cardLeft;
    anchorY = anchorXInCard(cy, cardTop, cardH);
  }

  let arrow: { left: number; top: number };
  let arrowBorder: { left: number; top: number };

  if (placement === 'top') {
    arrow = { left: anchorX - ARROW_FILL_HALF, top: cardTop + cardH - ARROW_OVERLAP };
    arrowBorder = { left: anchorX - ARROW_BORDER_HALF, top: cardTop + cardH - ARROW_OVERLAP - 1 };
  } else if (placement === 'bottom') {
    arrow = { left: anchorX - ARROW_FILL_HALF, top: cardTop + ARROW_OVERLAP - ARROW_FILL_H };
    arrowBorder = {
      left: anchorX - ARROW_BORDER_HALF,
      top: cardTop + ARROW_OVERLAP - ARROW_BORDER_HALF,
    };
  } else if (placement === 'left') {
    arrow = { left: cardLeft + cardW - ARROW_OVERLAP, top: anchorY - ARROW_FILL_HALF };
    arrowBorder = { left: cardLeft + cardW - ARROW_OVERLAP - 1, top: anchorY - ARROW_BORDER_HALF };
  } else {
    arrow = { left: cardLeft + ARROW_OVERLAP - ARROW_FILL_H, top: anchorY - ARROW_FILL_HALF };
    arrowBorder = {
      left: cardLeft + ARROW_OVERLAP - ARROW_BORDER_HALF,
      top: anchorY - ARROW_BORDER_HALF,
    };
  }

  return { card: { left: cardLeft, top: cardTop }, arrow, arrowBorder, placement };
}

const FLIP_MAP: Record<string, Placement> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
};

const AUTO_PRIORITY: Placement[] = ['right', 'bottom', 'top', 'left'];

export function computePosition(options: HintCardPositionOptions): HintCardPositionResult {
  const {
    triggerRect,
    cardWidth,
    cardHeight,
    placement = 'auto',
    viewportMargin = VIEWPORT_MARGIN,
    gap = GAP,
  } = options;

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (placement !== 'auto') {
    const result = calcForPlacement(
      triggerRect,
      cardWidth,
      cardHeight,
      placement,
      vw,
      vh,
      viewportMargin,
      gap,
    );
    if (result) {
      return result;
    }

    // 翻转到对侧
    const flipped = FLIP_MAP[placement];
    if (flipped) {
      const flippedResult = calcForPlacement(
        triggerRect,
        cardWidth,
        cardHeight,
        flipped,
        vw,
        vh,
        viewportMargin,
        gap,
      );
      if (flippedResult) {
        return flippedResult;
      }
    }

    // 都放不下，clamp 到视口
    const cx = triggerRect.left + triggerRect.width / 2;
    const cardLeft = clamp(cx - cardWidth / 2, viewportMargin, vw - cardWidth - viewportMargin);
    const cardTop = clamp(
      placement === 'top' ? triggerRect.top - cardHeight - gap : triggerRect.bottom + gap,
      viewportMargin,
      vh - cardHeight - viewportMargin,
    );
    return buildResult(triggerRect, cardLeft, cardTop, cardWidth, cardHeight, placement);
  }

  // auto：按优先级尝试
  for (const p of AUTO_PRIORITY) {
    const result = calcForPlacement(
      triggerRect,
      cardWidth,
      cardHeight,
      p,
      vw,
      vh,
      viewportMargin,
      gap,
    );
    if (result) {
      return result;
    }
  }

  // 所有方向都放不下，使用 top 并 clamp
  const cx = triggerRect.left + triggerRect.width / 2;
  const cardLeft = clamp(cx - cardWidth / 2, viewportMargin, vw - cardWidth - viewportMargin);
  const cardTop = clamp(
    triggerRect.top - cardHeight - gap,
    viewportMargin,
    vh - cardHeight - viewportMargin,
  );
  return buildResult(triggerRect, cardLeft, cardTop, cardWidth, cardHeight, 'top');
}
