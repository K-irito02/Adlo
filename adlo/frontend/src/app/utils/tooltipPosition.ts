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

// 滑移贴边上限（事项 9）：滑移后矩形与原位矩形的边沿间距（位移减 tooltip 自身
// 尺寸，贴边滑移 gap≈0）超过该值即视为与触发点失去视觉关联，拒绝并继续换边。
// 取值来源：事项 9 实测远甩边沿间距 460px，常规贴边滑移约 100–110px（导航栏长标签、
// 双 WebView 窄缝，见单测），取二者之间约 2 倍常规值。
// 已知取舍：超宽 tooltip 在窄缝中的合法远贴边可能被误杀，回退埋进 WebView（低概率），
// 宁要近边/回退、不要远甩；远期可遥测观察。
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
 * （legacy 分支专用；避让分支见事项 9 注释——两条路径判据不同，改一处时不要
 * 想当然同步另一处。）
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

    const coversTrigger = (result: PositionResult): boolean => {
      return (
        result.x < triggerRect.right &&
        result.x + tooltipRect.width > triggerRect.left &&
        result.y < triggerRect.bottom &&
        result.y + tooltipRect.height > triggerRect.top
      );
    };

    /** 首选边贴边收紧：沿主轴把 tooltip 挪到避让矩形边缘之外，保持首选边。
     * 仅当挪动后仍完整位于视口内、且不越过触发按钮时返回；否则交给滑移/换边。 */
    const snugAgainstAvoidRects = (
      base: PositionResult,
      placementToUse: Placement,
    ): PositionResult | null => {
      // 仅处理上下两种主轴：左右侧贴边收紧会改变「远滑移拒绝后换边」的既有取舍，
      // 且本次问题只发生在标题栏（bottom/top 主轴）。
      if (!isHorizontalPlacement(placementToUse)) {
        return null;
      }
      const size = isHorizontalPlacement(placementToUse) ? tooltipRect.height : tooltipRect.width;
      let current: PositionResult = { ...base };
      // 一次只挪一条边；最多迭代「矩形数 + 1」次，避免多矩形窄缝下死循环。
      for (let attempt = 0; attempt <= avoidRects.length; attempt += 1) {
        const overlapping = avoidRects.filter(
          (r) =>
            current.x < r.right &&
            current.x + tooltipRect.width > r.left &&
            current.y < r.bottom &&
            current.y + tooltipRect.height > r.top,
        );
        if (overlapping.length === 0) {
          return attempt === 0 ? null : current;
        }
        const currentMain = getMainAxisCoord(current, placementToUse);
        const escapes: number[] = [];
        for (const r of overlapping) {
          let escape: number;
          switch (placementToUse) {
            case 'bottom':
              escape = r.top - tooltipRect.height;
              break;
            case 'top':
              escape = r.bottom;
              break;
            case 'right':
              escape = r.left - tooltipRect.width;
              break;
            case 'left':
              escape = r.right;
              break;
          }
          // 收紧后必须仍位于触发按钮的首选侧（不越过按钮）。
          const staysOnPreferredSide =
            placementToUse === 'bottom'
              ? escape >= triggerRect.bottom
              : placementToUse === 'top'
                ? escape + tooltipRect.height <= triggerRect.top
                : placementToUse === 'right'
                  ? escape >= triggerRect.right
                  : escape + tooltipRect.width <= triggerRect.left;
          if (staysOnPreferredSide) {
            escapes.push(escape);
          }
        }
        if (escapes.length === 0) {
          return null;
        }
        escapes.sort((a, b) => Math.abs(a - currentMain) - Math.abs(b - currentMain));
        const next = escapes[0]!;
        if (next === currentMain) {
          return null;
        }
        const moved: PositionResult = { ...current };
        setMainAxisCoord(moved, placementToUse, next);
        clampMainAxis(moved, placementToUse, size, viewportPadding);
        if (getMainAxisCoord(moved, placementToUse) !== next) {
          // 收紧后会被视口裁切：放弃该策略，交给滑移/换边。
          return null;
        }
        current = moved;
      }
      return null;
    };

    for (const trial of trialOrder) {
      const base = calculate(trial);
      if (!mainAxisFits(base, trial)) {
        const mainSize = isHorizontalPlacement(trial) ? tooltipRect.height : tooltipRect.width;
        // （避让分支）首选侧差一点放不下时钳进视口、留在该侧（事项 9）：翻边常把
        // 送进 WebView 覆盖区（底边）或触发远滑移（右侧），远差于贴边显示。
        // 如顶部工具栏（按钮顶 y=36）：top 槽 y=-2 仅被裁 2px，钳到 padding 后
        // 落在标题栏区、不压 WebView，正是用户要的"按钮上方"。钳后允许至多
        // padding 量级的触发器边缘覆盖（瞬态层，远优于翻边远甩），钳后重叠仍由
        // 滑移/换边接管。
        clampMainAxis(base, trial, mainSize, viewportPadding);
      }
      // 首选边贴边收紧（标题栏按钮场景）：tooltip 底边只跨进 WebView 几像素时，
      // 优先沿主轴挪回 WebView 边缘之内（间距变小），而不是翻到按钮上方再被
      // 钳进标题栏、压住触发按钮。仅在仍完整位于视口内且不越过触发按钮时生效。
      const snug = snugAgainstAvoidRects(base, trial);
      if (snug) {
        // 非首选边不得压住触发按钮：翻边后盖住按钮会抢点击，正是本次要修的现象。
        // 首选边保留既有容差（贴边钳入视口时允许覆盖按钮边缘几个像素）。
        if (trial === placement || !coversTrigger(snug)) {
          return snug;
        }
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
          if (trial === placement || !coversTrigger(cleared)) {
            return cleared;
          }
        }
        // 否则继续换边。
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
      // 贴边容差（本分支 legacy、无避让矩形专用，与避让分支判据不同，见事项 9）：
      // 仅内边距不足、tooltip 未被裁切时钳进视口，不翻边。避让分支是一律钳住留
      // 首选侧（Tauri 底边常是 WebView，翻边有害）；本分支真裁切仍翻边（浏览器
      // 模式底边槽可见，翻边无害）。改一处时不要想当然同步另一处。
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
