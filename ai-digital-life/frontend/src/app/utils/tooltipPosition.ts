export type Placement = 'top' | 'bottom' | 'left' | 'right';
export type Alignment = 'start' | 'center' | 'end';

export interface PositionResult {
  x: number;
  y: number;
  placement: Placement;
}

/**
 * WebView2 是 OS 级渲染表面，DOM tooltip 永远盖不住它。
 * 调用方可传入 WebView 容器矩形，定位时优先选择不与之重叠的一侧。
 */
export interface AvoidRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface TooltipPositionOptions {
  triggerRect: DOMRect;
  tooltipRect: { width: number; height: number };
  placement: Placement;
  alignment?: Alignment;
  offset?: number;
  viewportPadding?: number;
  avoidRects?: AvoidRect[];
}

const OPPOSITE_MAP: Record<Placement, Placement> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
};

function getMainAxisCoord(result: PositionResult, placement: Placement): number {
  switch (placement) {
    case 'top':
    case 'bottom':
      return result.y;
    case 'left':
    case 'right':
      return result.x;
  }
}

function setMainAxisCoord(result: PositionResult, placement: Placement, value: number): void {
  switch (placement) {
    case 'top':
    case 'bottom':
      result.y = value;
      break;
    case 'left':
    case 'right':
      result.x = value;
      break;
  }
}

function getCrossAxisCoord(result: PositionResult, placement: Placement): number {
  switch (placement) {
    case 'top':
    case 'bottom':
      return result.x;
    case 'left':
    case 'right':
      return result.y;
  }
}

function setCrossAxisCoord(result: PositionResult, placement: Placement, value: number): void {
  switch (placement) {
    case 'top':
    case 'bottom':
      result.x = value;
      break;
    case 'left':
    case 'right':
      result.y = value;
      break;
  }
}

function fitsInViewport(
  coord: number,
  size: number,
  axis: 'x' | 'y',
  viewportPadding: number,
): boolean {
  if (axis === 'x') {
    return coord >= viewportPadding && coord + size <= window.innerWidth - viewportPadding;
  }
  return coord >= viewportPadding && coord + size <= window.innerHeight - viewportPadding;
}

export function computePosition(options: TooltipPositionOptions): PositionResult {
  const {
    triggerRect,
    tooltipRect,
    placement,
    alignment = 'center',
    offset = 8,
    viewportPadding = 8,
  } = options;

  const currentPlacement = placement;

  function calculate(placementToUse: Placement): PositionResult {
    const localResult: PositionResult = { x: 0, y: 0, placement: placementToUse };

    switch (placementToUse) {
      case 'top':
        localResult.x = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
        localResult.y = triggerRect.top - tooltipRect.height - offset;
        break;
      case 'bottom':
        localResult.x = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
        localResult.y = triggerRect.bottom + offset;
        break;
      case 'left':
        localResult.x = triggerRect.left - tooltipRect.width - offset;
        localResult.y = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
        break;
      case 'right':
        localResult.x = triggerRect.right + offset;
        localResult.y = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
        break;
    }

    const isHorizontal = placementToUse === 'top' || placementToUse === 'bottom';
    const crossAxisSize = isHorizontal ? tooltipRect.width : tooltipRect.height;

    const crossAxis = isHorizontal ? 'x' : 'y';

    const crossCoord = getCrossAxisCoord(localResult, placementToUse);

    if (!fitsInViewport(crossCoord, crossAxisSize, crossAxis as 'x' | 'y', viewportPadding)) {
      const maxCross =
        (crossAxis === 'x' ? window.innerWidth : window.innerHeight) -
        viewportPadding -
        crossAxisSize;
      const clampedCross = Math.max(viewportPadding, Math.min(maxCross, crossCoord));
      setCrossAxisCoord(localResult, placementToUse, clampedCross);
    }

    switch (alignment) {
      case 'start': {
        if (isHorizontal) {
          localResult.x = triggerRect.left;
        } else {
          localResult.y = triggerRect.top;
        }
        break;
      }
      case 'end': {
        if (isHorizontal) {
          localResult.x = triggerRect.right - tooltipRect.width;
        } else {
          localResult.y = triggerRect.bottom - tooltipRect.height;
        }
        break;
      }
    }

    const finalCrossCoord = getCrossAxisCoord(localResult, placementToUse);
    const finalCrossAxisSize = isHorizontal ? tooltipRect.width : tooltipRect.height;
    if (
      !fitsInViewport(finalCrossCoord, finalCrossAxisSize, crossAxis as 'x' | 'y', viewportPadding)
    ) {
      const maxCross =
        (crossAxis === 'x' ? window.innerWidth : window.innerHeight) -
        viewportPadding -
        finalCrossAxisSize;
      const clampedCross = Math.max(viewportPadding, Math.min(maxCross, finalCrossCoord));
      setCrossAxisCoord(localResult, placementToUse, clampedCross);
    }

    return localResult;
  }

  // 仅当传入 avoidRects 时走避让分支：按 首选 → 对侧 → 其余两侧 依次试算，
  // 第一个"视口内 + 不与任何避让矩形重叠"的位置胜出；都不满足则回退到原有逻辑。
  // avoidRects 为空时保持原有行为不变（不尝试左右侧，避免窄视口行为变化）。
  if (options.avoidRects && options.avoidRects.length > 0) {
    const avoidRects = options.avoidRects;
    const others: Placement[] = (['top', 'bottom', 'left', 'right'] as Placement[]).filter(
      (p) => p !== placement && p !== OPPOSITE_MAP[placement],
    );
    const trialOrder: Placement[] = [placement, OPPOSITE_MAP[placement], ...others];

    const overlapsAvoid = (result: PositionResult): boolean => {
      const left = result.x;
      const top = result.y;
      const right = result.x + tooltipRect.width;
      const bottom = result.y + tooltipRect.height;
      return avoidRects.some(
        (r) => left < r.right && right > r.left && top < r.bottom && bottom > r.top,
      );
    };

    const mainAxisFits = (result: PositionResult, placementToUse: Placement): boolean => {
      const horizontal = placementToUse === 'top' || placementToUse === 'bottom';
      const size = horizontal ? tooltipRect.height : tooltipRect.width;
      const coord = getMainAxisCoord(result, placementToUse);
      return fitsInViewport(coord, size, (horizontal ? 'y' : 'x') as 'x' | 'y', viewportPadding);
    };

    for (const trial of trialOrder) {
      const candidate = calculate(trial);
      if (mainAxisFits(candidate, trial) && !overlapsAvoid(candidate)) {
        return candidate;
      }
    }
  }

  const initialResult = calculate(currentPlacement);

  const isHorizontal = currentPlacement === 'top' || currentPlacement === 'bottom';
  const mainAxisSize = isHorizontal ? tooltipRect.height : tooltipRect.width;
  const mainCoord = getMainAxisCoord(initialResult, currentPlacement);
  const mainAxis = isHorizontal ? 'y' : 'x';

  if (!fitsInViewport(mainCoord, mainAxisSize, mainAxis as 'x' | 'y', viewportPadding)) {
    const flippedPlacement = OPPOSITE_MAP[currentPlacement];
    const flippedResult = calculate(flippedPlacement);

    const flippedIsHorizontal = flippedPlacement === 'top' || flippedPlacement === 'bottom';
    const flippedMainAxisSize = flippedIsHorizontal ? tooltipRect.height : tooltipRect.width;
    const flippedMainCoord = getMainAxisCoord(flippedResult, flippedPlacement);
    const flippedMainAxis = flippedIsHorizontal ? 'y' : 'x';

    if (
      fitsInViewport(
        flippedMainCoord,
        flippedMainAxisSize,
        flippedMainAxis as 'x' | 'y',
        viewportPadding,
      )
    ) {
      return flippedResult;
    }

    const fallbackPlacement: Placement = isHorizontal ? 'bottom' : 'right';
    const fallbackResult = calculate(fallbackPlacement);

    const fbIsHorizontal = isHorizontal;
    const fbMainAxisSize = fbIsHorizontal ? tooltipRect.height : tooltipRect.width;
    const fbMainCoord = getMainAxisCoord(fallbackResult, fallbackPlacement);
    const fbMainAxis = fbIsHorizontal ? 'y' : 'x';

    if (!fitsInViewport(fbMainCoord, fbMainAxisSize, fbMainAxis as 'x' | 'y', viewportPadding)) {
      const maxMain =
        (fbMainAxis === 'y' ? window.innerHeight : window.innerWidth) -
        viewportPadding -
        fbMainAxisSize;
      const clampedMain = Math.max(viewportPadding, Math.min(maxMain, fbMainCoord));
      setMainAxisCoord(fallbackResult, fallbackPlacement, clampedMain);
    }

    return fallbackResult;
  }

  return initialResult;
}
