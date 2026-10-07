import { useCallback, useEffect, useRef, useState } from 'react';
import {
  autoRectForIndex,
  defaultPaneLayout,
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

function listPaneIds(container: HTMLElement | null): string[] {
  if (!container) {
    return [];
  }
  return Array.from(container.querySelectorAll<HTMLElement>('[data-pane-id]'))
    .map((el) => el.dataset.paneId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
}

function paneIndexOf(container: HTMLElement | null, paneId: string): number {
  const index = listPaneIds(container).indexOf(paneId);
  return index < 0 ? 0 : index;
}

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
 * 归一化后补齐 `free` 模式缺失的 rect：按窗格在网格中的下标取 `autoRectForIndex`。
 * 窗格身份只有在 `free` 模式下才有意义；`equal` 自动布局必须保持 `rects` 为空（spec §6.5）。
 */
function repairLayout(
  stored: TerminalPaneLayout,
  paneCount: number,
  container: HTMLElement | null,
): TerminalPaneLayout {
  const normalized = normalizePaneLayout(stored, paneCount);
  if (normalized.mode !== 'free') {
    return normalized;
  }
  const rects = { ...normalized.rects };
  let changed = false;
  listPaneIds(container).forEach((paneId, index) => {
    if (!rects[paneId]) {
      rects[paneId] = autoRectForIndex(index, paneCount);
      changed = true;
    }
  });
  return changed ? { ...normalized, rects } : normalized;
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

function fractionTracks(fractions: number[]): string {
  return fractions.map((f) => `${f}fr`).join(' ');
}

function applyRectStyle(el: HTMLElement, rect: PaneRect): void {
  el.style.left = `${rect.x * 100}%`;
  el.style.top = `${rect.y * 100}%`;
  el.style.width = `${rect.w * 100}%`;
  el.style.height = `${rect.h * 100}%`;
}

function clearRectStyle(el: HTMLElement): void {
  el.style.left = '';
  el.style.top = '';
  el.style.width = '';
  el.style.height = '';
}

/**
 * 按标签加载/保存多窗格布局并驱动拖拽交互的 Hook。
 *
 * 载入：`activeTabId` / `paneCount` 变化时读取该标签存储、修复后 setState。
 * 提交：`commit(next)` setState + 按标签落盘（无标签 id 时只更新内存态）。
 * 拖拽：`setPointerCapture` + rAF 节流；拖拽期仅写 CSS（比例写 CSS 变量、自由模式写内联
 * 几何），松手才提交并落盘，避免逐帧 setState。
 */
export function useTerminalPaneLayout({
  containerRef,
  activeTabId,
  paneCount,
}: UseTerminalPaneLayoutParams): UseTerminalPaneLayoutReturn {
  const [layout, setLayout] = useState<TerminalPaneLayout>(() => defaultPaneLayout(paneCount));
  const layoutRef = useRef(layout);

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  useEffect(() => {
    const stored = terminalPaneLayoutStore.loadForTab(activeTabId);
    const next = stored
      ? repairLayout(stored, paneCount, containerRef.current)
      : defaultPaneLayout(paneCount);
    layoutRef.current = next;
    setLayout(next);
    // containerRef 是稳定 ref，只读取挂载后 DOM；无需进入依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId, paneCount]);

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

  const handleColDividerPointerDown = useCallback(
    (colIndex: number, e: React.PointerEvent) => {
      const container = containerRef.current;
      if (!container) {
        return;
      }
      e.preventDefault();
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture?.(e.pointerId);
      const width = container.getBoundingClientRect().width || 1;
      const startX = e.clientX;
      const base = layoutRef.current.colFractions;
      let latest = base;
      let frame = 0;

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
        });
      };

      const handleUp = () => {
        if (frame) {
          window.cancelAnimationFrame(frame);
          frame = 0;
        }
        target.releasePointerCapture?.(e.pointerId);
        target.removeEventListener('pointermove', handleMove);
        target.removeEventListener('pointerup', handleUp);
        target.removeEventListener('pointercancel', handleUp);
        target.removeEventListener('lostpointercapture', handleUp);
        container.style.removeProperty(COL_FRACTIONS_VAR);
        container.style.removeProperty(ROW_FRACTIONS_VAR);
        commit({ ...layoutRef.current, colFractions: latest });
      };

      target.addEventListener('pointermove', handleMove);
      target.addEventListener('pointerup', handleUp);
      target.addEventListener('pointercancel', handleUp);
      target.addEventListener('lostpointercapture', handleUp);
    },
    [commit, containerRef],
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
      const height = container.getBoundingClientRect().height || 1;
      const startY = e.clientY;
      const base = layoutRef.current.rowFractions;
      let latest = base;
      let frame = 0;

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
        });
      };

      const handleUp = () => {
        if (frame) {
          window.cancelAnimationFrame(frame);
          frame = 0;
        }
        target.releasePointerCapture?.(e.pointerId);
        target.removeEventListener('pointermove', handleMove);
        target.removeEventListener('pointerup', handleUp);
        target.removeEventListener('pointercancel', handleUp);
        target.removeEventListener('lostpointercapture', handleUp);
        container.style.removeProperty(ROW_FRACTIONS_VAR);
        container.style.removeProperty(COL_FRACTIONS_VAR);
        commit({ ...layoutRef.current, rowFractions: latest });
      };

      target.addEventListener('pointermove', handleMove);
      target.addEventListener('pointerup', handleUp);
      target.addEventListener('pointercancel', handleUp);
      target.addEventListener('lostpointercapture', handleUp);
    },
    [commit, containerRef],
  );

  const handleFreeDragPointerDown = useCallback(
    (paneId: string, edge: FreeDragEdge, e: React.PointerEvent) => {
      const container = containerRef.current;
      if (!container) {
        return;
      }
      e.preventDefault();
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture?.(e.pointerId);
      const box = container.getBoundingClientRect();
      const width = box.width || 1;
      const height = box.height || 1;
      const startX = e.clientX;
      const startY = e.clientY;
      const paneEl = findPaneElement(container, paneId);
      const base =
        layoutRef.current.rects[paneId] ??
        autoRectForIndex(paneIndexOf(container, paneId), paneCount);
      const minW = MIN_PANE_W / width;
      const minH = MIN_PANE_H / height;
      let latest = base;
      let frame = 0;

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

      const handleUp = () => {
        if (frame) {
          window.cancelAnimationFrame(frame);
          frame = 0;
        }
        target.releasePointerCapture?.(e.pointerId);
        target.removeEventListener('pointermove', handleMove);
        target.removeEventListener('pointerup', handleUp);
        target.removeEventListener('pointercancel', handleUp);
        target.removeEventListener('lostpointercapture', handleUp);
        if (paneEl) {
          clearRectStyle(paneEl);
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
    },
    [commit, containerRef, paneCount],
  );

  const setMode = useCallback(
    (mode: PaneLayoutMode) => {
      commit({ ...layoutRef.current, mode });
    },
    [commit],
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
