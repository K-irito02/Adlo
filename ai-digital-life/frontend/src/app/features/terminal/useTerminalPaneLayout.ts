import { useCallback, useEffect, useRef, useState } from 'react';
import {
  autoRectForIndex,
  cumulativePercent,
  defaultPaneLayout,
  fractionTracks,
  MIN_PANE_H,
  MIN_PANE_W,
  normalizePaneLayout,
  resizeFractions,
  terminalPaneLayoutStore,
  type PaneLayoutMode,
  type PaneRect,
  type TerminalPaneLayout,
} from './terminalPaneLayout';

export type FreeDragEdge = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export interface UseTerminalPaneLayoutParams {
  containerRef: React.RefObject<HTMLDivElement | null>;
  activeTabId: string | undefined;
  paneCount: number;
  /** 该标签当前窗格 id，按网格顺序排列（真源，取代 DOM 查询）。 */
  paneIds: string[];
}

export interface UseTerminalPaneLayoutReturn {
  layout: TerminalPaneLayout;
  setMode: (mode: PaneLayoutMode) => void;
  resetAuto: () => void;
  handleColDividerPointerDown: (colIndex: number, e: React.PointerEvent) => void;
  handleRowDividerPointerDown: (rowIndex: number, e: React.PointerEvent) => void;
  handleFreeDragPointerDown: (paneId: string, edge: FreeDragEdge, e: React.PointerEvent) => void;
}

/**
 * 拖拽预览用的 CSS 变量（挂在 `containerRef` 元素上）：
 * `--adl-term-col-fractions` / `--adl-term-row-fractions`，取值形如 `"0.6fr 0.4fr"`。
 * C3 的网格渲染以它们为 `grid-template-columns/rows` 的可选覆盖，实现拖拽期不 setState 的实时预览。
 */
const COL_FRACTIONS_VAR = '--adl-term-col-fractions';
const ROW_FRACTIONS_VAR = '--adl-term-row-fractions';

/**
 * 拖拽期边界线位置变量前缀：`--adl-term-col-divider-<i>` / `--adl-term-row-divider-<i>`（百分比）。
 * 与轨道 `--adl-term-*-fractions` 同步写入，使 C3 网格的 1px 边界线跟随实时预览（不依赖 setState）。
 */
const COL_DIVIDER_VAR_PREFIX = '--adl-term-col-divider-';
const ROW_DIVIDER_VAR_PREFIX = '--adl-term-row-divider-';

/** 窗格 id → 网格下标；未知 id 返回 -1（调用方应视为 no-op）。 */
function paneIndexOf(paneIds: string[], paneId: string): number {
  return paneIds.indexOf(paneId);
}

/**
 * 仅用于拖拽期就地写入自由模式几何预览：按 paneId 找到 `.adl-terminal-pane` 元素。
 * **窗格身份来自 `paneIds`，与此 DOM 查询无关**；查不到只是没有实时预览，提交仍正确。
 */
function findPaneElement(container: HTMLElement | null, paneId: string): HTMLElement | null {
  if (!container) {
    return null;
  }
  const marker = Array.from(container.querySelectorAll<HTMLElement>('[data-pane-id]')).find(
    (el) => el.dataset.paneId === paneId,
  );
  if (!marker) {
    return null;
  }
  return marker.closest<HTMLElement>('.adl-terminal-pane') ?? marker;
}

/**
 * 拖拽换算的「分母」：优先取内层网格 `.adl-terminal-pane-grid` 的实测尺寸。
 *
 * 网格有 `min-width/min-height = MIN_PANE_*×cols/rows`，面板比网格窄/矮时网格会在
 * `.adl-terminal-pane-grid-scroll` 内溢出滚动；此时边界线的 `left/top` 百分比是
 * **网格宽度**的百分比，自由窗格像素几何也按网格尺寸换算。若仍用外层滚动容器宽度
 * 当分母，`Δpx/容器宽` 会比实际拖拽量偏大 `网格/容器` 倍（拖拽跑得比光标快）。
 *
 * 容器自身即网格（测试 / 简化 DOM）时直接用容器；否则查其后代。尺寸取元素 rect 与
 * `scroll*` 的较大值，兜底 1 以避免零除。
 */
export function measureGridContent(container: HTMLElement | null): {
  width: number;
  height: number;
} {
  if (!container) {
    return { width: 1, height: 1 };
  }
  const grid = container.matches('.adl-terminal-pane-grid')
    ? container
    : container.querySelector<HTMLElement>('.adl-terminal-pane-grid');
  const target = grid ?? container;
  const rect = target.getBoundingClientRect();
  const width = Math.max(rect.width, target.scrollWidth) || 1;
  const height = Math.max(rect.height, target.scrollHeight) || 1;
  return { width, height };
}

/** 数值数组逐项相等：纯点击（无 pointermove）时用于跳过提交/落盘。 */
function numbersEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** 归一化矩形逐字段相等：自由模式纯点击（无 pointermove）时用于跳过提交/落盘。 */
function rectsEqual(a: PaneRect, b: PaneRect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

/**
 * `free` 模式 rect 归一：以 `paneIds` 为唯一身份来源，按 `paneIds` 顺序补齐缺失项
 * （`autoRectForIndex`）并剪掉不在 `paneIds` 中的陈旧键。未知/缺失容器 DOM 不再影响结果。
 */
function reconcileFreeRects(
  existing: Record<string, PaneRect>,
  paneCount: number,
  paneIds: string[],
): Record<string, PaneRect> {
  const rects: Record<string, PaneRect> = {};
  paneIds.forEach((paneId, index) => {
    rects[paneId] = existing[paneId] ?? autoRectForIndex(index, paneCount);
  });
  return rects;
}

/**
 * 设定模式并让 `rects` 与模式一致：`free` 补齐 + 剪枝；`equal` 恒清空。
 * 即不变量：`rects` 非空 ⇔ `mode === 'free'`（`resetAuto` 走 `defaultPaneLayout`，同为等分空 rects）。
 */
function withMode(
  layout: TerminalPaneLayout,
  mode: PaneLayoutMode,
  paneCount: number,
  paneIds: string[],
): TerminalPaneLayout {
  const rects = mode === 'free' ? reconcileFreeRects(layout.rects, paneCount, paneIds) : {};
  return { ...layout, mode, rects };
}

function repairLayout(
  stored: TerminalPaneLayout,
  paneCount: number,
  paneIds: string[],
): TerminalPaneLayout {
  const normalized = normalizePaneLayout(stored, paneCount);
  return withMode(normalized, normalized.mode, paneCount, paneIds);
}

/** 按拖拽边调整归一化 rect，最小像素夹取并收敛在 0..1 容器内。纯函数便于推理。 */
export function applyFreeDrag(
  rect: PaneRect,
  edge: FreeDragEdge,
  dFx: number,
  dFy: number,
  minW: number,
  minH: number,
): PaneRect {
  let { x, y, w, h } = rect;
  if (edge === 'move') {
    x += dFx;
    y += dFy;
  } else {
    if (edge.includes('e')) {
      w += dFx;
    }
    if (edge.includes('w')) {
      x += dFx;
      w -= dFx;
    }
    if (edge.includes('s')) {
      h += dFy;
    }
    if (edge.includes('n')) {
      y += dFy;
      h -= dFy;
    }
    if (w < minW) {
      if (edge.includes('w')) {
        x -= minW - w;
      }
      w = minW;
    }
    if (h < minH) {
      if (edge.includes('n')) {
        y -= minH - h;
      }
      h = minH;
    }
  }
  w = Math.min(w, 1);
  h = Math.min(h, 1);
  x = Math.max(0, Math.min(x, 1 - w));
  y = Math.max(0, Math.min(y, 1 - h));
  return { x, y, w, h };
}

/** 各边界线的累计比例（百分比）：第 i 条 = `fractions[0..i]` 之和，共 `length-1` 条。 */
function dividerPercents(fractions: number[]): string[] {
  const percents: string[] = [];
  for (let index = 0; index < fractions.length - 1; index += 1) {
    percents.push(`${cumulativePercent(fractions, index + 1)}%`);
  }
  return percents;
}

function publishDividerVars(container: HTMLElement, prefix: string, fractions: number[]): void {
  dividerPercents(fractions).forEach((percent, index) => {
    container.style.setProperty(`${prefix}${index}`, percent);
  });
}

function clearDividerVars(container: HTMLElement, prefix: string, boundaryCount: number): void {
  for (let index = 0; index < boundaryCount; index += 1) {
    container.style.removeProperty(`${prefix}${index}`);
  }
}

function applyRectStyle(el: HTMLElement, rect: PaneRect): void {
  el.style.left = `${rect.x * 100}%`;
  el.style.top = `${rect.y * 100}%`;
  el.style.width = `${rect.w * 100}%`;
  el.style.height = `${rect.h * 100}%`;
}

/**
 * 按标签加载/保存多窗格布局并驱动拖拽交互的 Hook。
 *
 * 载入：`activeTabId` / `paneCount` / `paneIds` 顺序变化时读取该标签存储、修复后 setState。
 * 提交：`commit(next)` setState + 按标签落盘（无标签 id 时只更新内存态）。
 * 拖拽：`setPointerCapture` + rAF 节流；拖拽期仅写 CSS（比例写 CSS 变量、自由模式写内联
 * 几何），松手才提交并落盘，避免逐帧 setState。每次 move 同步计算最新值，rAF 只节流 DOM 写入，
 * 保证松手前的最后一帧不丢失。卸载时清理进行中的拖拽预览。
 */
export function useTerminalPaneLayout({
  containerRef,
  activeTabId,
  paneCount,
  paneIds,
}: UseTerminalPaneLayoutParams): UseTerminalPaneLayoutReturn {
  const [layout, setLayout] = useState<TerminalPaneLayout>(() => defaultPaneLayout(paneCount));
  const layoutRef = useRef(layout);
  const activeDragsRef = useRef<Set<() => void>>(new Set());

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  // 稳定的顺序键：调用方常传内联数组，直接依赖 `paneIds` 会在每次渲染跑 effect。
  const paneOrderKey = paneIds.join('\u0000');

  useEffect(() => {
    const orderedPaneIds = paneOrderKey.length > 0 ? paneOrderKey.split('\u0000') : [];
    const stored = terminalPaneLayoutStore.loadForTab(activeTabId);
    const next = stored
      ? repairLayout(stored, paneCount, orderedPaneIds)
      : defaultPaneLayout(paneCount);
    layoutRef.current = next;
    setLayout(next);
  }, [activeTabId, paneCount, paneOrderKey]);

  useEffect(
    () => () => {
      activeDragsRef.current.forEach((teardown) => teardown());
      activeDragsRef.current.clear();
    },
    [],
  );

  const commit = useCallback(
    (next: TerminalPaneLayout) => {
      layoutRef.current = next;
      setLayout(next);
      if (activeTabId) {
        terminalPaneLayoutStore.saveForTab(activeTabId, next);
      }
    },
    [activeTabId],
  );

  /** 注册一次拖拽的清理函数（卸载/松手共用；幂等）。 */
  const registerDrag = useCallback((teardown: () => void) => {
    activeDragsRef.current.add(teardown);
    return teardown;
  }, []);

  const unregisterDrag = useCallback((teardown: () => void) => {
    activeDragsRef.current.delete(teardown);
  }, []);

  const handleColDividerPointerDown = useCallback(
    (colIndex: number, e: React.PointerEvent) => {
      const container = containerRef.current;
      if (!container) {
        return;
      }
      e.preventDefault();
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture?.(e.pointerId);
      const { width } = measureGridContent(container);
      const startX = e.clientX;
      const base = layoutRef.current.colFractions;
      let latest = base;
      let frame = 0;
      let settled = false;

      const handleMove = (moveEvent: PointerEvent) => {
        latest = resizeFractions(
          base,
          colIndex,
          (moveEvent.clientX - startX) / width,
          MIN_PANE_W,
          width,
        );
        if (frame) {
          return;
        }
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          container.style.setProperty(COL_FRACTIONS_VAR, fractionTracks(latest));
          container.style.setProperty(
            ROW_FRACTIONS_VAR,
            fractionTracks(layoutRef.current.rowFractions),
          );
          publishDividerVars(container, COL_DIVIDER_VAR_PREFIX, latest);
        });
      };

      const teardown = () => {
        if (settled) {
          return;
        }
        settled = true;
        if (frame) {
          window.cancelAnimationFrame(frame);
          frame = 0;
        }
        target.removeEventListener('pointermove', handleMove);
        target.removeEventListener('pointerup', handleUp);
        target.removeEventListener('pointercancel', handleUp);
        target.removeEventListener('lostpointercapture', handleUp);
        container.style.removeProperty(COL_FRACTIONS_VAR);
        container.style.removeProperty(ROW_FRACTIONS_VAR);
        clearDividerVars(container, COL_DIVIDER_VAR_PREFIX, Math.max(0, base.length - 1));
      };

      const handleUp = () => {
        teardown();
        unregisterDrag(teardown);
        target.releasePointerCapture?.(e.pointerId);
        if (numbersEqual(latest, base)) {
          return;
        }
        commit({ ...layoutRef.current, colFractions: latest });
      };

      target.addEventListener('pointermove', handleMove);
      target.addEventListener('pointerup', handleUp);
      target.addEventListener('pointercancel', handleUp);
      target.addEventListener('lostpointercapture', handleUp);
      registerDrag(teardown);
    },
    [commit, containerRef, registerDrag, unregisterDrag],
  );

  const handleRowDividerPointerDown = useCallback(
    (rowIndex: number, e: React.PointerEvent) => {
      const container = containerRef.current;
      if (!container) {
        return;
      }
      e.preventDefault();
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture?.(e.pointerId);
      const { height } = measureGridContent(container);
      const startY = e.clientY;
      const base = layoutRef.current.rowFractions;
      let latest = base;
      let frame = 0;
      let settled = false;

      const handleMove = (moveEvent: PointerEvent) => {
        latest = resizeFractions(
          base,
          rowIndex,
          (moveEvent.clientY - startY) / height,
          MIN_PANE_H,
          height,
        );
        if (frame) {
          return;
        }
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          container.style.setProperty(ROW_FRACTIONS_VAR, fractionTracks(latest));
          container.style.setProperty(
            COL_FRACTIONS_VAR,
            fractionTracks(layoutRef.current.colFractions),
          );
          publishDividerVars(container, ROW_DIVIDER_VAR_PREFIX, latest);
        });
      };

      const teardown = () => {
        if (settled) {
          return;
        }
        settled = true;
        if (frame) {
          window.cancelAnimationFrame(frame);
          frame = 0;
        }
        target.removeEventListener('pointermove', handleMove);
        target.removeEventListener('pointerup', handleUp);
        target.removeEventListener('pointercancel', handleUp);
        target.removeEventListener('lostpointercapture', handleUp);
        container.style.removeProperty(ROW_FRACTIONS_VAR);
        container.style.removeProperty(COL_FRACTIONS_VAR);
        clearDividerVars(container, ROW_DIVIDER_VAR_PREFIX, Math.max(0, base.length - 1));
      };

      const handleUp = () => {
        teardown();
        unregisterDrag(teardown);
        target.releasePointerCapture?.(e.pointerId);
        if (numbersEqual(latest, base)) {
          return;
        }
        commit({ ...layoutRef.current, rowFractions: latest });
      };

      target.addEventListener('pointermove', handleMove);
      target.addEventListener('pointerup', handleUp);
      target.addEventListener('pointercancel', handleUp);
      target.addEventListener('lostpointercapture', handleUp);
      registerDrag(teardown);
    },
    [commit, containerRef, registerDrag, unregisterDrag],
  );

  const handleFreeDragPointerDown = useCallback(
    (paneId: string, edge: FreeDragEdge, e: React.PointerEvent) => {
      const container = containerRef.current;
      if (!container) {
        return;
      }
      const index = paneIndexOf(paneIds, paneId);
      if (index < 0) {
        return;
      }
      e.preventDefault();
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture?.(e.pointerId);
      const { width, height } = measureGridContent(container);
      const startX = e.clientX;
      const startY = e.clientY;
      const paneEl = findPaneElement(container, paneId);
      const base = layoutRef.current.rects[paneId] ?? autoRectForIndex(index, paneCount);
      const minW = MIN_PANE_W / width;
      const minH = MIN_PANE_H / height;
      let latest = base;
      let frame = 0;
      let settled = false;

      const handleMove = (moveEvent: PointerEvent) => {
        latest = applyFreeDrag(
          base,
          edge,
          (moveEvent.clientX - startX) / width,
          (moveEvent.clientY - startY) / height,
          minW,
          minH,
        );
        if (frame) {
          return;
        }
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          if (paneEl) {
            applyRectStyle(paneEl, latest);
          }
        });
      };

      const teardown = () => {
        if (settled) {
          return;
        }
        settled = true;
        if (frame) {
          window.cancelAnimationFrame(frame);
          frame = 0;
        }
        target.removeEventListener('pointermove', handleMove);
        target.removeEventListener('pointerup', handleUp);
        target.removeEventListener('pointercancel', handleUp);
        target.removeEventListener('lostpointercapture', handleUp);
      };

      const handleUp = () => {
        teardown();
        unregisterDrag(teardown);
        target.releasePointerCapture?.(e.pointerId);
        // 纯点击（无位移 / 被夹取到与起点相同）：不提交、不落盘。自由模式几何由
        // React 拥有并以内联样式渲染，teardown 不再清理（清理会在 React 未重写时
        // 抹掉窗格几何 → 窗格塌陷）。
        if (rectsEqual(latest, base)) {
          return;
        }
        commit({
          ...layoutRef.current,
          rects: { ...layoutRef.current.rects, [paneId]: latest },
        });
      };

      target.addEventListener('pointermove', handleMove);
      target.addEventListener('pointerup', handleUp);
      target.addEventListener('pointercancel', handleUp);
      target.addEventListener('lostpointercapture', handleUp);
      registerDrag(teardown);
    },
    [commit, containerRef, paneCount, paneIds, registerDrag, unregisterDrag],
  );

  const setMode = useCallback(
    (mode: PaneLayoutMode) => {
      commit(withMode(layoutRef.current, mode, paneCount, paneIds));
    },
    [commit, paneCount, paneIds],
  );

  const resetAuto = useCallback(() => {
    commit(defaultPaneLayout(paneCount));
  }, [commit, paneCount]);

  return {
    layout,
    setMode,
    resetAuto,
    handleColDividerPointerDown,
    handleRowDividerPointerDown,
    handleFreeDragPointerDown,
  };
}
