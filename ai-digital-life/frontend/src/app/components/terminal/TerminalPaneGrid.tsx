// src/app/components/terminal/TerminalPaneGrid.tsx
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { HScrollbar } from '@components/HScrollbar';
import { RevealScrollbar } from '@components/RevealScrollbar';
import {
  autoRectForIndex,
  computeGrid,
  MIN_PANE_H,
  MIN_PANE_W,
  type PaneRect,
  type TerminalPaneLayout,
} from '@features/terminal/terminalPaneLayout';
import type { FreeDragEdge } from '@features/terminal/useTerminalPaneLayout';
import { useRevealScrollbar } from '@hooks/useRevealScrollbar';
import type { TerminalPane } from '@stores/slices/terminalSliceTypes';

export interface TerminalPaneGridProps {
  panes: TerminalPane[];
  activePaneId?: string;
  maximizedPaneId: string | null;
  layout: TerminalPaneLayout;
  onColDividerPointerDown: (colIndex: number, e: ReactPointerEvent) => void;
  onRowDividerPointerDown: (rowIndex: number, e: ReactPointerEvent) => void;
  onFreeDragPointerDown: (paneId: string, edge: FreeDragEdge, e: ReactPointerEvent) => void;
  renderPane: (pane: TerminalPane) => ReactNode;
}

/** free 模式八向拖拽手柄（四边 + 四角）。 */
const FREE_DRAG_EDGES: FreeDragEdge[] = ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'];

/** equal 轨道串：`[0.5,0.5] → "0.5fr 0.5fr"`；空数组回退 `1fr` 避免 `var()` 空回退值。 */
function fractionTracks(fractions: number[]): string {
  return fractions.length > 0 ? fractions.map((fraction) => `${fraction}fr`).join(' ') : '1fr';
}

/** 第 boundary 条边界线处的累计比例（百分比），用于绝对定位。 */
function cumulativePercent(fractions: number[], boundary: number): number {
  let sum = 0;
  for (let index = 0; index < boundary; index += 1) {
    sum += fractions[index] ?? 0;
  }
  return sum * 100;
}

/**
 * free 窗格几何：优先按测量到的容器尺寸换算像素（随容器缩放等比映射）；
 * 未测量到尺寸（首帧 / 无布局环境）时回退归一化百分比。
 */
function freePaneStyle(rect: PaneRect, size: { w: number; h: number }): CSSProperties {
  if (size.w > 0 && size.h > 0) {
    return {
      left: `${rect.x * size.w}px`,
      top: `${rect.y * size.h}px`,
      width: `${rect.w * size.w}px`,
      height: `${rect.h * size.h}px`,
    };
  }
  return {
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.w * 100}%`,
    height: `${rect.h * 100}%`,
  };
}

/**
 * 多窗格显示区：按 `layout.mode` 渲染 equal（CSS Grid + 比例拖拽边界线）或
 * free（绝对定位 + 八向拖拽手柄）布局；`maximizedPaneId` 时只渲染该窗格。
 *
 * 卷帘门裁剪：内层网格最小尺寸 = `MIN_PANE_W×cols` / `MIN_PANE_H×rows`，外层
 * `overflow:auto` 容器视口不足时裁剪并可滚动查看，滚动条复用项目自定义 overlay
 * （垂直 RevealScrollbar + 水平 HScrollbar）。
 *
 * equal 实时拖拽预览：`grid-template-columns/rows` 优先取容器 CSS 变量
 * `--adl-term-col-fractions` / `--adl-term-row-fractions`（C2 Hook 拖拽期写入），
 * 回退到 `layout` 派生轨道；free 拖拽预览由 Hook 就地写窗格内联几何。
 */
export function TerminalPaneGrid({
  panes,
  activePaneId,
  maximizedPaneId,
  layout,
  onColDividerPointerDown,
  onRowDividerPointerDown,
  onFreeDragPointerDown,
  renderPane,
}: TerminalPaneGridProps) {
  const isFree = layout.mode === 'free';
  const visiblePanes = maximizedPaneId
    ? panes.filter((pane) => pane.id === maximizedPaneId)
    : panes;
  // 网格规模取自「可见窗格」：最大化时 1×1，避免卷帘门最小尺寸被整表窗格数撑大而误出滚动条。
  const { cols, rows } = computeGrid(visiblePanes.length);

  const gridRef = useRef<HTMLDivElement | null>(null);
  const [gridSize, setGridSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const element = gridRef.current;
    if (!element) {
      return undefined;
    }
    const measure = () => {
      const rect = element.getBoundingClientRect();
      setGridSize((prev) =>
        prev.w === rect.width && prev.h === rect.height ? prev : { w: rect.width, h: rect.height },
      );
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const verticalScrollbar = useRevealScrollbar([layout.mode, panes.length]);
  const horizontalScrollbar = useRevealScrollbar([layout.mode, panes.length], 'horizontal');
  const verticalRef = verticalScrollbar.scrollRef;
  const horizontalRef = horizontalScrollbar.scrollRef;
  const attachScrollElement = useCallback(
    (element: HTMLDivElement | null) => {
      verticalRef.current = element;
      horizontalRef.current = element;
    },
    [verticalRef, horizontalRef],
  );

  const gridStyle: CSSProperties = {
    minWidth: `${MIN_PANE_W * cols}px`,
    minHeight: `${MIN_PANE_H * rows}px`,
  };
  if (!maximizedPaneId && !isFree) {
    gridStyle.gridTemplateColumns = `var(--adl-term-col-fractions, ${fractionTracks(layout.colFractions)})`;
    gridStyle.gridTemplateRows = `var(--adl-term-row-fractions, ${fractionTracks(layout.rowFractions)})`;
  }

  const gridClassName = `adl-terminal-pane-grid ${
    maximizedPaneId ? 'is-maximized' : isFree ? 'is-free' : 'is-equal'
  }`;

  return (
    <div
      className="adl-terminal-pane-grid-scroll-host adl-reveal-scrollbar-host"
      onMouseEnter={() => {
        verticalScrollbar.hoverProps.onMouseEnter();
        horizontalScrollbar.hoverProps.onMouseEnter();
      }}
      onMouseLeave={() => {
        verticalScrollbar.hoverProps.onMouseLeave();
        horizontalScrollbar.hoverProps.onMouseLeave();
      }}
    >
      <div className="adl-terminal-pane-grid-scroll" ref={attachScrollElement}>
        <div ref={gridRef} className={gridClassName} style={gridStyle}>
          {visiblePanes.map((pane, index) => {
            const paneStyle =
              !maximizedPaneId && isFree
                ? freePaneStyle(
                    layout.rects[pane.id] ?? autoRectForIndex(index, panes.length),
                    gridSize,
                  )
                : undefined;
            return (
              <div
                key={pane.id}
                className={`adl-terminal-pane${pane.id === activePaneId ? ' is-active' : ''}${
                  pane.id === maximizedPaneId ? ' is-maximized' : ''
                }`}
                style={paneStyle}
              >
                {renderPane(pane)}
                {!maximizedPaneId && isFree && (
                  <>
                    {FREE_DRAG_EDGES.map((edge) => (
                      <div
                        key={edge}
                        className={`adl-terminal-free-handle adl-terminal-free-handle--${edge}`}
                        onPointerDown={(event) => onFreeDragPointerDown(pane.id, edge, event)}
                      />
                    ))}
                    {/* 专用移动手柄（不采用整窗格拖动，避免吞掉 xterm 输入/选择） */}
                    <div
                      className="adl-terminal-free-handle adl-terminal-free-handle--move"
                      onPointerDown={(event) => onFreeDragPointerDown(pane.id, 'move', event)}
                    />
                  </>
                )}
              </div>
            );
          })}

          {!maximizedPaneId &&
            !isFree &&
            Array.from({ length: Math.max(0, cols - 1) }, (_, index) => (
              <div
                key={`col-divider-${index}`}
                className="adl-terminal-col-divider"
                style={{
                  left: `var(--adl-term-col-divider-${index}, ${cumulativePercent(
                    layout.colFractions,
                    index + 1,
                  )}%)`,
                }}
                onPointerDown={(event) => onColDividerPointerDown(index, event)}
                role="separator"
                aria-orientation="vertical"
              />
            ))}

          {!maximizedPaneId &&
            !isFree &&
            Array.from({ length: Math.max(0, rows - 1) }, (_, index) => (
              <div
                key={`row-divider-${index}`}
                className="adl-terminal-row-divider"
                style={{
                  top: `var(--adl-term-row-divider-${index}, ${cumulativePercent(
                    layout.rowFractions,
                    index + 1,
                  )}%)`,
                }}
                onPointerDown={(event) => onRowDividerPointerDown(index, event)}
                role="separator"
                aria-orientation="horizontal"
              />
            ))}
        </div>
      </div>

      <RevealScrollbar controller={verticalScrollbar} />
      <HScrollbar controller={horizontalScrollbar} />
    </div>
  );
}
