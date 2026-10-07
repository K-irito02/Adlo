// src/app/components/terminal/__tests__/TerminalPaneGrid.test.tsx
import { useRef } from 'react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { TerminalPane } from '@stores/slices/terminalSliceTypes';
import {
  autoRectForIndex,
  defaultPaneLayout,
  MIN_PANE_H,
  MIN_PANE_W,
  terminalPaneLayoutStore,
  type PaneRect,
  type TerminalPaneLayout,
} from '@features/terminal/terminalPaneLayout';
import { useTerminalPaneLayout } from '@features/terminal/useTerminalPaneLayout';
import { TerminalPaneGrid } from '../TerminalPaneGrid';

function makePanes(count: number): TerminalPane[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    profile: 'bash' as const,
    status: 'idle' as const,
    colorIndex: 0,
  }));
}

function freeLayout(panes: TerminalPane[]): TerminalPaneLayout {
  const rects: Record<string, PaneRect> = {};
  panes.forEach((pane, index) => {
    rects[pane.id] = autoRectForIndex(index, panes.length);
  });
  return { mode: 'free', colFractions: [], rowFractions: [], rects };
}

interface Overrides {
  panes?: TerminalPane[];
  activePaneId?: string;
  maximizedPaneId?: string | null;
  layout?: TerminalPaneLayout;
}

function renderGrid(overrides: Overrides = {}) {
  const panes = overrides.panes ?? makePanes(4);
  const layout = overrides.layout ?? defaultPaneLayout(panes.length);
  const onColDividerPointerDown = vi.fn();
  const onRowDividerPointerDown = vi.fn();
  const onFreeDragPointerDown = vi.fn();
  const { container } = render(
    <TerminalPaneGrid
      panes={panes}
      activePaneId={overrides.activePaneId}
      maximizedPaneId={overrides.maximizedPaneId ?? null}
      layout={layout}
      dividerLabel="Resize pane"
      onColDividerPointerDown={onColDividerPointerDown}
      onRowDividerPointerDown={onRowDividerPointerDown}
      onFreeDragPointerDown={onFreeDragPointerDown}
      renderPane={(pane) => <div data-testid={`pane-${pane.id}`}>{pane.id}</div>}
    />,
  );
  return { container, onColDividerPointerDown, onRowDividerPointerDown, onFreeDragPointerDown };
}

describe('TerminalPaneGrid', () => {
  it('equal 模式渲染 is-equal，grid-template 先取拖拽 CSS 变量、回退到 fractions 派生值', () => {
    const { container } = renderGrid({ panes: makePanes(4) });
    const grid = container.querySelector('.adl-terminal-pane-grid') as HTMLElement;
    expect(grid.classList.contains('is-equal')).toBe(true);
    expect(grid.style.gridTemplateColumns).toBe('var(--adl-term-col-fractions, 0.5fr 0.5fr)');
    expect(grid.style.gridTemplateRows).toBe('var(--adl-term-row-fractions, 0.5fr 0.5fr)');
  });

  it('卷帘门裁剪：外层滚动容器 + 内层最小尺寸随窗格数增长', () => {
    const { container } = renderGrid({ panes: makePanes(5) });
    expect(container.querySelector('.adl-terminal-pane-grid-scroll')).not.toBeNull();
    const grid = container.querySelector('.adl-terminal-pane-grid') as HTMLElement;
    // 5 窗格 → 3 列 2 行
    expect(grid.style.minWidth).toBe(`${MIN_PANE_W * 3}px`);
    expect(grid.style.minHeight).toBe(`${MIN_PANE_H * 2}px`);
  });

  it('free 模式渲染 is-free，每窗格带内联 left/top/width/height', () => {
    const panes = makePanes(2);
    const { container } = renderGrid({ panes, layout: freeLayout(panes) });
    const grid = container.querySelector('.adl-terminal-pane-grid') as HTMLElement;
    expect(grid.classList.contains('is-free')).toBe(true);
    // 自由模式不按网格铺排：容器最小尺寸为单窗格最小值，而非 computeGrid 派生的网格尺寸。
    expect(grid.style.minWidth).toBe(`${MIN_PANE_W}px`);
    expect(grid.style.minHeight).toBe(`${MIN_PANE_H}px`);
    const wrappers = container.querySelectorAll<HTMLElement>('.adl-terminal-pane');
    expect(wrappers).toHaveLength(2);
    for (const wrapper of wrappers) {
      expect(wrapper.style.left).not.toBe('');
      expect(wrapper.style.top).not.toBe('');
      expect(wrapper.style.width).not.toBe('');
      expect(wrapper.style.height).not.toBe('');
    }
    // 未测量到容器尺寸时回退为归一化百分比
    expect(wrappers[0].style.left).toBe('0%');
    expect(wrappers[0].style.width).toBe('50%');
    expect(wrappers[0].style.height).toBe('100%');
  });

  it('free 模式测量到容器尺寸后按像素定位', () => {
    const callbacks: ResizeObserverCallback[] = [];
    class CapturingResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        callbacks.push(callback);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    const original = globalThis.ResizeObserver;
    vi.stubGlobal('ResizeObserver', CapturingResizeObserver);
    try {
      const panes = makePanes(2);
      const { container } = renderGrid({ panes, layout: freeLayout(panes) });
      const grid = container.querySelector('.adl-terminal-pane-grid') as HTMLElement;
      grid.getBoundingClientRect = () =>
        ({ width: 400, height: 300, left: 0, top: 0, right: 400, bottom: 300 }) as DOMRect;
      act(() => {
        for (const callback of callbacks) {
          callback([], {} as ResizeObserver);
        }
      });
      const first = container.querySelectorAll<HTMLElement>('.adl-terminal-pane')[0];
      expect(first.style.left).toBe('0px');
      expect(first.style.width).toBe('200px');
      expect(first.style.height).toBe('300px');
    } finally {
      vi.stubGlobal('ResizeObserver', original);
    }
  });

  it('free 模式为每个窗格渲染八向边角手柄 + 专用移动手柄并回调对应 edge', () => {
    const panes = makePanes(1);
    const { container, onFreeDragPointerDown } = renderGrid({ panes, layout: freeLayout(panes) });
    const handles = container.querySelectorAll('.adl-terminal-free-handle');
    expect(handles).toHaveLength(9);

    const east = container.querySelector('.adl-terminal-free-handle--e') as HTMLElement;
    fireEvent.pointerDown(east, { pointerId: 1 });
    expect(onFreeDragPointerDown).toHaveBeenCalledWith('p1', 'e', expect.anything());

    const move = container.querySelector('.adl-terminal-free-handle--move') as HTMLElement;
    fireEvent.pointerDown(move, { pointerId: 2 });
    expect(onFreeDragPointerDown).toHaveBeenCalledWith('p1', 'move', expect.anything());

    // a11y：手柄为具名 button，复用注入的 dividerLabel。
    for (const handle of handles) {
      expect(handle.getAttribute('role')).toBe('button');
      expect(handle.getAttribute('aria-label')).toBe('Resize pane');
    }
  });

  it('maximizedPaneId 时只渲染该窗格且网格标记 is-maximized', () => {
    const { container } = renderGrid({ panes: makePanes(3), maximizedPaneId: 'p2' });
    expect(screen.queryByTestId('pane-p1')).toBeNull();
    expect(screen.queryByTestId('pane-p3')).toBeNull();
    expect(screen.getByTestId('pane-p2')).toBeInTheDocument();
    expect(container.querySelector('.adl-terminal-pane-grid.is-maximized')).not.toBeNull();
    expect(container.querySelectorAll('.adl-terminal-pane')).toHaveLength(1);

    // 最大化按可见窗格（1×1）计算卷帘门最小尺寸，避免被整表窗格数撑大而误出滚动条
    const grid = container.querySelector('.adl-terminal-pane-grid') as HTMLElement;
    expect(grid.style.minWidth).toBe(`${MIN_PANE_W}px`);
    expect(grid.style.minHeight).toBe(`${MIN_PANE_H}px`);
  });

  it('列/行边界线数量 = cols-1 / rows-1，且位置取自拖拽预览变量并回退到派生值', () => {
    const four = renderGrid({ panes: makePanes(4) });
    expect(four.container.querySelectorAll('.adl-terminal-col-divider')).toHaveLength(1);
    expect(four.container.querySelectorAll('.adl-terminal-row-divider')).toHaveLength(1);
    // 2×2 网格：唯一边界在 50%，消费 C2 拖拽期发布的 `--adl-term-*-divider-<i>`
    expect(four.container.querySelector<HTMLElement>('.adl-terminal-col-divider')?.style.left).toBe(
      'var(--adl-term-col-divider-0, 50%)',
    );
    expect(four.container.querySelector<HTMLElement>('.adl-terminal-row-divider')?.style.top).toBe(
      'var(--adl-term-row-divider-0, 50%)',
    );
    // a11y：边界线为 separator，带注入的可访问名称
    const colDivider = four.container.querySelector<HTMLElement>('.adl-terminal-col-divider');
    const rowDivider = four.container.querySelector<HTMLElement>('.adl-terminal-row-divider');
    expect(colDivider?.getAttribute('aria-label')).toBe('Resize pane');
    expect(rowDivider?.getAttribute('aria-label')).toBe('Resize pane');

    // 3 窗格仍是 2x2 网格，不足最后一行不多渲染边界线
    const three = renderGrid({ panes: makePanes(3) });
    expect(three.container.querySelectorAll('.adl-terminal-col-divider')).toHaveLength(1);
    expect(three.container.querySelectorAll('.adl-terminal-row-divider')).toHaveLength(1);

    // 5 窗格 = 3 列 2 行
    const five = renderGrid({ panes: makePanes(5) });
    expect(five.container.querySelectorAll('.adl-terminal-col-divider')).toHaveLength(2);
    expect(five.container.querySelectorAll('.adl-terminal-row-divider')).toHaveLength(1);
  });

  it('拖拽边界线回调携带对应下标；free / maximized 不渲染边界线', () => {
    const equal = renderGrid({ panes: makePanes(5) });
    const colDivider = equal.container.querySelectorAll<HTMLElement>(
      '.adl-terminal-col-divider',
    )[1];
    fireEvent.pointerDown(colDivider, { pointerId: 1 });
    expect(equal.onColDividerPointerDown).toHaveBeenCalledWith(1, expect.anything());

    const panes = makePanes(2);
    const free = renderGrid({ panes, layout: freeLayout(panes) });
    expect(free.container.querySelector('.adl-terminal-col-divider')).toBeNull();

    const max = renderGrid({ panes: makePanes(4), maximizedPaneId: 'p1' });
    expect(max.container.querySelector('.adl-terminal-col-divider')).toBeNull();
  });

  it('活动窗格包装层带 is-active', () => {
    const { container } = renderGrid({ panes: makePanes(2), activePaneId: 'p2' });
    const active = container.querySelector('.adl-terminal-pane.is-active');
    expect(active).not.toBeNull();
    expect(active?.querySelector('[data-testid="pane-p2"]')).not.toBeNull();
  });
});

/**
 * H1 回归：自由模式下纯点击（pointerdown + pointerup 无位移）手柄不得抹掉窗格内联
 * 几何。旧实现的拖拽 teardown 无条件 clearRectStyle，而 React 样式 diff 看到值未变
 * 就不会重写内联样式 → 窗格失去 left/top/width/height 而塌陷。
 */
function FreeGridHarness({ tabId }: { tabId: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panes = makePanes(1);
  const hook = useTerminalPaneLayout({
    containerRef,
    activeTabId: tabId,
    paneCount: panes.length,
    paneIds: panes.map((pane) => pane.id),
  });
  return (
    <div ref={containerRef}>
      <TerminalPaneGrid
        panes={panes}
        maximizedPaneId={null}
        layout={hook.layout}
        dividerLabel="Resize pane"
        onColDividerPointerDown={hook.handleColDividerPointerDown}
        onRowDividerPointerDown={hook.handleRowDividerPointerDown}
        onFreeDragPointerDown={hook.handleFreeDragPointerDown}
        renderPane={(pane) => <div className="adl-terminal-live" data-pane-id={pane.id} />}
      />
    </div>
  );
}

describe('TerminalPaneGrid free-mode no-move handle click (H1 regression)', () => {
  afterEach(() => {
    localStorage.clear();
    terminalPaneLayoutStore.apply({});
  });

  it('纯点击（无位移）不会抹掉窗格内联几何', () => {
    localStorage.clear();
    terminalPaneLayoutStore.apply({});
    const panes = makePanes(1);
    terminalPaneLayoutStore.saveForTab('t1', freeLayout(panes));

    const { container } = render(<FreeGridHarness tabId="t1" />);

    const pane = container.querySelector<HTMLElement>('.adl-terminal-pane');
    expect(pane).not.toBeNull();
    // React 已按 free 布局写入内联几何。
    expect(pane?.style.left).not.toBe('');
    expect(pane?.style.width).not.toBe('');

    const moveHandle = container.querySelector<HTMLElement>(
      '.adl-terminal-free-handle--move',
    ) as HTMLElement;
    act(() => {
      fireEvent.pointerDown(moveHandle, { pointerId: 1, clientX: 0, clientY: 0 });
      fireEvent.pointerUp(moveHandle, { pointerId: 1, clientX: 0, clientY: 0 });
    });

    expect(pane?.style.left).not.toBe('');
    expect(pane?.style.top).not.toBe('');
    expect(pane?.style.width).not.toBe('');
    expect(pane?.style.height).not.toBe('');
  });
});
