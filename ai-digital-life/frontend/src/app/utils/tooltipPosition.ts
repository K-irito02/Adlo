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

// 滑移贴边上限（事项 9）：滑移后 tooltip 与原位边沿间距超过该值即视为与触发点
// 失去视觉关联（如被甩到内容区右缘），拒绝并继续换边。常规贴边滑移（导航栏长
// 标签约 100px、双 WebView 窄缝约 110px）远小于此值，不受影响。
const MAX_SLIDE_DETACH_PX = 200;

// 矫正手写/四舍五入产生的非法矩形（left > right 等）并丢弃零面积，
// 与 webviewAvoidRects 的零面积跳过形成双层保证。
function normalizeAvoidRects(rects: AvoidRect[]): AvoidRect[] {
  const out: AvoidRect[] = [];
  for (const r of rects) {
    const left = Math.min(r.left, r.right);
    const right = Math.max(r.left, r.right);
    const top = Math.min(r.top, r.bottom);
    const bottom = Math.max(r.top, r.bottom);
    if (right > left && bottom > top) {
      out.push({ left, top, right, bottom });
    }
  }
  return out;
}

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

function isHorizontalPlacement(placement: Placement): boolean {
  return placement === 'top' || placement === 'bottom';
}

function mainAxisOf(placement: Placement): 'x' | 'y' {
  return isHorizontalPlacement(placement) ? 'y' : 'x';
}

function viewportLength(axis: 'x' | 'y'): number {
  if (typeof window === 'undefined') {
    return 0;
  }
  return axis === 'x' ? window.innerWidth : window.innerHeight;
}

function fitsInViewport(
  coord: number,
  size: number,
  axis: 'x' | 'y',
  viewportPadding: number,
): boolean {
  const len = viewportLength(axis);
  return coord >= viewportPadding && coord + size <= len - viewportPadding;
}

/**
 * 主轴是否完整落在视口内（可能违反内边距，但绝不会被裁切）。
 *
 * 贴边容差：`fitsInViewport` 同时要求留出 `viewportPadding`，而触发点上方的可用空间
 * 常常刚好差几个像素 —— 顶部工具栏紧贴 36px 标题栏时，28px 按钮顶部只有 44px，而
 * 30px tooltip + offset 8 + padding 8 需要 46px，于是首选 `top` 被判为“放不下”。
 * 一旦翻到对侧 `bottom`，tooltip 便落进 WebView 避让矩形，被横轴滑移到矩形远缘
 * （视觉上“Tooltip 离触发点非常远”）。只要 tooltip 本身没被裁切，就应留在首选侧、
 * 把主轴钳进视口，而不是换边。
 */
function mainAxisFitsWithoutClipping(
  result: PositionResult,
  placementToUse: Placement,
  size: number,
): boolean {
  const coord = getMainAxisCoord(result, placementToUse);
  return coord >= 0 && coord + size <= viewportLength(mainAxisOf(placementToUse));
}

/** 把主轴坐标钳进视口（两侧各留出 `viewportPadding`）。
 *
 * 退化取舍：当 `size > 视口长 − 2·padding` 时 `maxCoord < padding`，
 * `Math.max(padding, min(maxCoord, coord))` 恒返回 padding，tooltip 远缘可溢出
 * 视口至多 padding px。此退化需要 tooltip ≈ 全屏高/宽才可达（现实中不存在），
 * 且与 `calculate()` 内横轴钳制、legacy fallback 的既有钳制行为同构 ——
 * 保持一致而非在此单独收敛。
 */
function clampMainAxis(
  result: PositionResult,
  placementToUse: Placement,
  size: number,
  viewportPadding: number,
): void {
  const coord = getMainAxisCoord(result, placementToUse);
  const maxCoord = viewportLength(mainAxisOf(placementToUse)) - viewportPadding - size;
  setMainAxisCoord(result, placementToUse, Math.max(viewportPadding, Math.min(maxCoord, coord)));
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

    const isHorizontal = isHorizontalPlacement(placementToUse);
    const crossAxisSize = isHorizontal ? tooltipRect.width : tooltipRect.height;

    const crossAxis = isHorizontal ? 'x' : 'y';

    const crossCoord = getCrossAxisCoord(localResult, placementToUse);

    if (!fitsInViewport(crossCoord, crossAxisSize, crossAxis, viewportPadding)) {
      const maxCross = viewportLength(crossAxis) - viewportPadding - crossAxisSize;
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
    if (!fitsInViewport(finalCrossCoord, finalCrossAxisSize, crossAxis, viewportPadding)) {
      const maxCross = viewportLength(crossAxis) - viewportPadding - finalCrossAxisSize;
      const clampedCross = Math.max(viewportPadding, Math.min(maxCross, finalCrossCoord));
      setCrossAxisCoord(localResult, placementToUse, clampedCross);
    }

    return localResult;
  }

  // 仅当传入 avoidRects 时走避让分支：按 首选 → 对侧 → 其余两侧 依次试算，
  // 第一个"视口内 + 不与任何避让矩形重叠"的位置胜出；都不满足则回退到原有逻辑
  // （回退 = 可能与 WebView 重叠，调用方不得把 avoidRects 理解为硬保证）。
  // avoidRects 为空时保持原有行为不变（不尝试左右侧，避免窄视口行为变化）。
  if (options.avoidRects && options.avoidRects.length > 0) {
    const avoidRects = normalizeAvoidRects(options.avoidRects);
    // 归一化后变空（全零面积）→ 等价于未传入，走原有逻辑。
    if (avoidRects.length === 0) {
      return legacyPosition();
    }
    const others: Placement[] = (['top', 'bottom', 'left', 'right'] as Placement[]).filter(
      (p) => p !== placement && p !== OPPOSITE_MAP[placement],
    );
    const trialOrder: Placement[] = [placement, OPPOSITE_MAP[placement], ...others];

    const mainAxisFits = (result: PositionResult, placementToUse: Placement): boolean => {
      const horizontal = isHorizontalPlacement(placementToUse);
      const size = horizontal ? tooltipRect.height : tooltipRect.width;
      const coord = getMainAxisCoord(result, placementToUse);
      return fitsInViewport(coord, size, mainAxisOf(placementToUse), viewportPadding);
    };

    // 横轴滑移：纵轴（主轴）已放下但横向压住 Webview 时，沿横轴平移到最近的
    // 空位（仍钳在视口内），而不是直接换边。触发点紧贴 Webview、tooltip 又宽
    // （如导航栏长标签）时，这是唯一能"留在首选边又不被盖"的解。
    // 注意：滑移后 tooltip 可能远离触发点正上方（无箭头、无视觉锚点，属预期行为）。
    // 逃逸点为启发式（各矩形两侧边缘），多矩形窄缝可能漏解（此时换边/回退接管）。
    const slideCrossAxis = (
      base: PositionResult,
      placementToUse: Placement,
    ): PositionResult | null => {
      const horizontal = isHorizontalPlacement(placementToUse);
      const crossSize = horizontal ? tooltipRect.width : tooltipRect.height;
      const mainLo = horizontal ? base.y : base.x;
      const mainHi = mainLo + (horizontal ? tooltipRect.height : tooltipRect.width);
      const viewportLen = viewportLength(horizontal ? 'x' : 'y');
      const baseCoord = horizontal ? base.x : base.y;

      const isClear = (coord: number): boolean =>
        !avoidRects.some((r) => {
          const mainOverlap = horizontal
            ? mainLo < r.bottom && mainHi > r.top
            : mainLo < r.right && mainHi > r.left;
          if (!mainOverlap) {
            return false;
          }
          const crossLo = horizontal ? r.left : r.top;
          const crossHi = horizontal ? r.right : r.bottom;
          return coord < crossHi && coord + crossSize > crossLo;
        });

      if (isClear(baseCoord)) {
        return base;
      }

      // 逃逸点：每个相交矩形的两侧边缘（贴边不算重叠）；取视口内离原位最近的。
      const escapePoints: number[] = [];
      for (const r of avoidRects) {
        const mainOverlap = horizontal
          ? mainLo < r.bottom && mainHi > r.top
          : mainLo < r.right && mainHi > r.left;
        if (!mainOverlap) {
          continue;
        }
        const crossLo = horizontal ? r.left : r.top;
        const crossHi = horizontal ? r.right : r.bottom;
        escapePoints.push(crossLo - crossSize, crossHi);
      }
      const minCoord = viewportPadding;
      const maxCoord = viewportLen - viewportPadding - crossSize;
      let best: number | null = null;
      for (const p of escapePoints) {
        if (p < minCoord || p > maxCoord) {
          continue;
        }
        if (!isClear(p)) {
          continue;
        }
        if (best === null || Math.abs(p - baseCoord) < Math.abs(best - baseCoord)) {
          best = p;
        }
      }
      if (best === null) {
        return null;
      }
      const moved: PositionResult = { ...base, placement: placementToUse };
      if (horizontal) {
        moved.x = best;
      } else {
        moved.y = best;
      }
      return moved;
    };

    for (const trial of trialOrder) {
      const base = calculate(trial);
      if (!mainAxisFits(base, trial)) {
        const mainSize = isHorizontalPlacement(trial) ? tooltipRect.height : tooltipRect.width;
        // 贴边容差：仅因内边距不足（tooltip 未被裁切）时留在首选侧并钳进视口；
        // 真正放不下（会被裁切）才换边。见 `mainAxisFitsWithoutClipping`。
        if (!mainAxisFitsWithoutClipping(base, trial, mainSize)) {
          continue;
        }
        clampMainAxis(base, trial, mainSize, viewportPadding);
      }
      // 视口内但横向压住 Webview → 先滑移；滑不动才换边。
      const cleared = slideCrossAxis(base, trial);
      if (cleared) {
        // 过远滑移拒绝并继续换边（事项 9）：只接受"贴边"级滑移——滑移后 tooltip
        // 与原位边沿间距超过该阈值，即认为已与触发点失去视觉关联（如工具栏按钮
        // tooltip 被甩到内容区右缘），宁可换一条更近的边。小幅贴边滑移
        // （如导航栏长标签、双 WebView 窄缝）不受影响。
        const horizontal = isHorizontalPlacement(trial);
        const crossSize = horizontal ? tooltipRect.width : tooltipRect.height;
        const edgeGap =
          Math.abs((horizontal ? cleared.x : cleared.y) - (horizontal ? base.x : base.y)) -
          crossSize;
        if (edgeGap <= MAX_SLIDE_DETACH_PX) {
          return cleared;
        }
      }
    }
    return legacyPosition();
  }

  return legacyPosition();

  function legacyPosition(): PositionResult {
    const initialResult = calculate(currentPlacement);

    const isHorizontal = isHorizontalPlacement(currentPlacement);
    const mainAxisSize = isHorizontal ? tooltipRect.height : tooltipRect.width;
    const mainCoord = getMainAxisCoord(initialResult, currentPlacement);
    const mainAxis = mainAxisOf(currentPlacement);

    if (!fitsInViewport(mainCoord, mainAxisSize, mainAxis, viewportPadding)) {
      // 贴边容差（沿用与避让分支同一判据）：仅内边距不足、tooltip 未被裁切时钳进
      // 视口，不翻边。两条路径对该判据一致，故「首选侧贴边」这一常见情形下浏览器模式
      // 与 Tauri 模式给出同一位置；若首选侧被**真正裁切**，避让分支还会继续尝试其它
      // 候选边（本分支只按 首选 → 对侧 → fallback 回退），此时两者本就允许不同。
      if (mainAxisFitsWithoutClipping(initialResult, currentPlacement, mainAxisSize)) {
        clampMainAxis(initialResult, currentPlacement, mainAxisSize, viewportPadding);
        return initialResult;
      }

      const flippedPlacement = OPPOSITE_MAP[currentPlacement];
      const flippedResult = calculate(flippedPlacement);

      const flippedIsHorizontal = isHorizontalPlacement(flippedPlacement);
      const flippedMainAxisSize = flippedIsHorizontal ? tooltipRect.height : tooltipRect.width;
      const flippedMainCoord = getMainAxisCoord(flippedResult, flippedPlacement);
      const flippedMainAxis = mainAxisOf(flippedPlacement);

      if (fitsInViewport(flippedMainCoord, flippedMainAxisSize, flippedMainAxis, viewportPadding)) {
        return flippedResult;
      }

      const fallbackPlacement: Placement = isHorizontal ? 'bottom' : 'right';
      const fallbackResult = calculate(fallbackPlacement);

      const fbMainAxisSize = isHorizontal ? tooltipRect.height : tooltipRect.width;
      const fbMainCoord = getMainAxisCoord(fallbackResult, fallbackPlacement);
      const fbMainAxis = mainAxisOf(fallbackPlacement);

      if (!fitsInViewport(fbMainCoord, fbMainAxisSize, fbMainAxis, viewportPadding)) {
        const maxMain = viewportLength(fbMainAxis) - viewportPadding - fbMainAxisSize;
        const clampedMain = Math.max(viewportPadding, Math.min(maxMain, fbMainCoord));
        setMainAxisCoord(fallbackResult, fallbackPlacement, clampedMain);
      }

      return fallbackResult;
    }

    return initialResult;
  }
}
