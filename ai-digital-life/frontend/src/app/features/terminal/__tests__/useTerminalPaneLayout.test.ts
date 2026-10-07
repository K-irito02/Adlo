import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { RefObject } from 'react';
import { flushCrossSliceWrites } from '@stores/storageHelpers';
import {
  autoRectForIndex,
  defaultPaneLayout,
  terminalPaneLayoutStore,
  type TerminalPaneLayout,
} from '../terminalPaneLayout';
import { useTerminalPaneLayout, measureGridContent } from '../useTerminalPaneLayout';

if (typeof window.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  }
  Object.defineProperty(window, 'PointerEvent', {
    writable: true,
    configurable: true,
    value: PointerEventPolyfill,
  });
}

// Deferred rAF mock: callbacks are captured and only run when flushRaf() is called.
// This makes "move then release before the frame fires" reachable so the tests can
// actually guard the latest-delta-on-release behavior (Important #3).
const RAF_ORIGINAL = globalThis.requestAnimationFrame;
const CAF_ORIGINAL = globalThis.cancelAnimationFrame;
let rafQueue = new Map<number, FrameRequestCallback>();
let rafSeq = 0;

function flushRaf() {
  const pending = [...rafQueue.values()];
  rafQueue.clear();
  for (const cb of pending) {
    cb(0);
  }
}

beforeAll(() => {
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
    rafSeq += 1;
    rafQueue.set(rafSeq, cb);
    return rafSeq;
  };
  globalThis.cancelAnimationFrame = (id: number) => {
    rafQueue.delete(id);
  };
});

afterAll(() => {
  globalThis.requestAnimationFrame = RAF_ORIGINAL;
  globalThis.cancelAnimationFrame = CAF_ORIGINAL;
});

beforeEach(() => {
  localStorage.clear();
  terminalPaneLayoutStore.apply({});
  rafQueue = new Map();
  rafSeq = 0;
});

afterEach(() => {
  localStorage.clear();
});

function makeContainer(paneIds: string[], width = 800, height = 600): HTMLDivElement {
  const container = document.createElement('div');
  container.className = 'adl-terminal-pane-grid';
  for (const id of paneIds) {
    const wrap = document.createElement('div');
    wrap.className = 'adl-terminal-pane';
    const pane = document.createElement('div');
    pane.className = 'adl-terminal-live';
    pane.dataset.paneId = id;
    wrap.appendChild(pane);
    container.appendChild(wrap);
  }
  container.getBoundingClientRect = () =>
    ({
      width,
      height,
      left: 0,
      top: 0,
      right: width,
      bottom: height,
    }) as DOMRect;
  return container;
}

function rectOf(width: number, height: number): DOMRect {
  return {
    width,
    height,
    left: 0,
    top: 0,
    right: width,
    bottom: height,
  } as DOMRect;
}

/**
 * 真实卷帘门结构：外层滚动容器（视口）+ 内层 `.adl-terminal-pane-grid`（内容，
 * min-width/min-height 撑到比视口大）。用于验证拖拽分母取「网格内容」而非视口。
 */
function makeOverflowContainer(
  paneIds: string[],
  grid: { width: number; height: number },
  viewport: { width: number; height: number },
): HTMLDivElement {
  const outer = document.createElement('div');
  outer.className = 'adl-terminal-pane-grid-scroll';
  outer.getBoundingClientRect = () => rectOf(viewport.width, viewport.height);
  const gridEl = document.createElement('div');
  gridEl.className = 'adl-terminal-pane-grid';
  gridEl.getBoundingClientRect = () => rectOf(grid.width, grid.height);
  for (const id of paneIds) {
    const wrap = document.createElement('div');
    wrap.className = 'adl-terminal-pane';
    const pane = document.createElement('div');
    pane.className = 'adl-terminal-live';
    pane.dataset.paneId = id;
    wrap.appendChild(pane);
    gridEl.appendChild(wrap);
  }
  outer.appendChild(gridEl);
  return outer;
}

interface InitialProps {
  activeTabId: string | undefined;
  paneCount: number;
  paneIds: string[];
}

interface Harness {
  container: HTMLDivElement;
  rerender: (props: InitialProps) => void;
  unmount: () => void;
  current: () => ReturnType<typeof useTerminalPaneLayout>;
}

function renderLayout(
  initial: InitialProps & { withDomPanes?: boolean; container?: HTMLDivElement },
): Harness {
  const container =
    initial.container ?? makeContainer(initial.withDomPanes === false ? [] : initial.paneIds);
  const containerRef = { current: container } as RefObject<HTMLDivElement | null>;
  const { result, rerender, unmount } = renderHook(
    (props: InitialProps) =>
      useTerminalPaneLayout({
        containerRef,
        activeTabId: props.activeTabId,
        paneCount: props.paneCount,
        paneIds: props.paneIds,
      }),
    {
      initialProps: {
        activeTabId: initial.activeTabId,
        paneCount: initial.paneCount,
        paneIds: initial.paneIds,
      },
    },
  );
  return {
    container,
    rerender: (props) => rerender(props),
    unmount: () => unmount(),
    current: () => result.current,
  };
}

function fakePointerDown(
  target: HTMLElement,
  point: { clientX: number; clientY: number },
  pointerId = 1,
): React.PointerEvent {
  return {
    preventDefault: () => {},
    currentTarget: target,
    pointerId,
    clientX: point.clientX,
    clientY: point.clientY,
  } as unknown as React.PointerEvent;
}

function dispatchPointer(
  target: HTMLElement,
  type: 'pointermove' | 'pointerup',
  point: { clientX: number; clientY: number },
  pointerId = 1,
) {
  target.dispatchEvent(
    new PointerEvent(type, { pointerId, clientX: point.clientX, clientY: point.clientY }),
  );
}

describe('useTerminalPaneLayout per-tab loading', () => {
  it('defaults to the auto grid when no layout is stored', () => {
    const h = renderLayout({
      activeTabId: 't-empty',
      paneCount: 2,
      paneIds: ['p0', 'p1'],
    });
    expect(h.current().layout).toEqual(defaultPaneLayout(2));
  });

  it('loads the stored layout for the active tab and reloads on tab switch', () => {
    const tabA: TerminalPaneLayout = {
      mode: 'equal',
      colFractions: [0.25, 0.75],
      rowFractions: [1],
      rects: {},
    };
    const tabB: TerminalPaneLayout = {
      mode: 'free',
      colFractions: [0.5, 0.5],
      rowFractions: [1],
      rects: {},
    };
    terminalPaneLayoutStore.saveForTab('t-a', tabA);
    terminalPaneLayoutStore.saveForTab('t-b', tabB);

    const h = renderLayout({ activeTabId: 't-a', paneCount: 2, paneIds: ['p0', 'p1'] });
    expect(h.current().layout).toEqual(tabA);

    act(() => h.rerender({ activeTabId: 't-b', paneCount: 2, paneIds: ['p0', 'p1'] }));
    expect(h.current().layout.mode).toBe('free');
    expect(h.current().layout.colFractions).toEqual([0.5, 0.5]);
  });

  it('repairs fraction lengths via computeGrid when paneCount changes', () => {
    terminalPaneLayoutStore.saveForTab('t-grow', {
      mode: 'equal',
      colFractions: [1],
      rowFractions: [1],
      rects: {},
    });
    const h = renderLayout({ activeTabId: 't-grow', paneCount: 1, paneIds: ['p0'] });
    expect(h.current().layout.colFractions).toHaveLength(1);
    expect(h.current().layout.rowFractions).toHaveLength(1);

    act(() =>
      h.rerender({ activeTabId: 't-grow', paneCount: 4, paneIds: ['p0', 'p1', 'p2', 'p3'] }),
    );
    expect(h.current().layout.colFractions).toHaveLength(2);
    expect(h.current().layout.rowFractions).toHaveLength(2);
  });

  it('fills missing free rects from paneIds order, without relying on DOM', () => {
    terminalPaneLayoutStore.saveForTab('t-free', {
      mode: 'free',
      colFractions: [0.5, 0.5],
      rowFractions: [0.5, 0.5],
      rects: { p0: { x: 0, y: 0, w: 0.5, h: 0.5 } },
    });
    const h = renderLayout({
      activeTabId: 't-free',
      paneCount: 4,
      paneIds: ['p0', 'p1', 'p2', 'p3'],
      withDomPanes: false,
    });
    expect(h.current().layout.rects).toEqual({
      p0: { x: 0, y: 0, w: 0.5, h: 0.5 },
      p1: autoRectForIndex(1, 4),
      p2: autoRectForIndex(2, 4),
      p3: autoRectForIndex(3, 4),
    });
  });

  it('prunes free rect keys that are not in paneIds', () => {
    terminalPaneLayoutStore.saveForTab('t-prune', {
      mode: 'free',
      colFractions: [0.5, 0.5],
      rowFractions: [1],
      rects: {
        p0: { x: 0, y: 0, w: 0.5, h: 1 },
        ghost: { x: 0.9, y: 0.9, w: 0.1, h: 0.1 },
      },
    });
    const h = renderLayout({ activeTabId: 't-prune', paneCount: 2, paneIds: ['p0', 'p1'] });
    expect(Object.keys(h.current().layout.rects).sort()).toEqual(['p0', 'p1']);
  });
});

describe('useTerminalPaneLayout actions', () => {
  it('setMode to free fills missing rects and persists (Important #1)', () => {
    const h = renderLayout({
      activeTabId: 't-mode-free',
      paneCount: 4,
      paneIds: ['p0', 'p1', 'p2', 'p3'],
    });
    expect(h.current().layout.rects).toEqual({});

    act(() => h.current().setMode('free'));
    expect(h.current().layout.mode).toBe('free');
    expect(h.current().layout.rects).toEqual({
      p0: autoRectForIndex(0, 4),
      p1: autoRectForIndex(1, 4),
      p2: autoRectForIndex(2, 4),
      p3: autoRectForIndex(3, 4),
    });

    flushCrossSliceWrites();
    expect(terminalPaneLayoutStore.loadForTab('t-mode-free')?.rects.p0).toEqual(
      autoRectForIndex(0, 4),
    );
  });

  it('setMode to free prunes stale rect keys', () => {
    terminalPaneLayoutStore.saveForTab('t-mode-prune', {
      mode: 'free',
      colFractions: [0.5, 0.5],
      rowFractions: [1],
      rects: { p0: { x: 0, y: 0, w: 0.5, h: 1 }, ghost: { x: 0.9, y: 0.9, w: 0.1, h: 0.1 } },
    });
    const h = renderLayout({ activeTabId: 't-mode-prune', paneCount: 2, paneIds: ['p0', 'p1'] });
    act(() => h.current().setMode('equal'));
    act(() => h.current().setMode('free'));
    expect(Object.keys(h.current().layout.rects).sort()).toEqual(['p0', 'p1']);
  });

  it('resetAuto restores defaultPaneLayout and persists it', () => {
    const h = renderLayout({
      activeTabId: 't-reset',
      paneCount: 4,
      paneIds: ['p0', 'p1', 'p2', 'p3'],
    });
    act(() => h.current().setMode('free'));
    act(() => h.current().resetAuto());

    const expected = defaultPaneLayout(4);
    expect(h.current().layout).toEqual(expected);
    flushCrossSliceWrites();
    expect(terminalPaneLayoutStore.loadForTab('t-reset')).toEqual(expected);
  });

  it('does not persist without an active tab id', () => {
    const h = renderLayout({ activeTabId: undefined, paneCount: 2, paneIds: ['p0', 'p1'] });
    act(() => h.current().setMode('free'));
    flushCrossSliceWrites();
    expect(terminalPaneLayoutStore.loadAll()).toEqual({});
  });
});

describe('useTerminalPaneLayout drag', () => {
  it('previews an equal column drag through a CSS variable and commits on release', () => {
    const h = renderLayout({ activeTabId: 't-col', paneCount: 2, paneIds: ['p0', 'p1'] });
    const divider = document.createElement('div');

    act(() =>
      h
        .current()
        .handleColDividerPointerDown(0, fakePointerDown(divider, { clientX: 0, clientY: 0 })),
    );
    act(() => dispatchPointer(divider, 'pointermove', { clientX: 80, clientY: 0 }));
    act(() => flushRaf());

    const preview = h.container.style.getPropertyValue('--adl-term-col-fractions');
    expect(preview.startsWith('0.6')).toBe(true);
    // 边界线位置变量与轨道同步发布，使 C3 的 1px 边界线跟随实时预览
    const dividerPreview = h.container.style.getPropertyValue('--adl-term-col-divider-0');
    expect(dividerPreview.startsWith('60')).toBe(true);
    expect(dividerPreview.endsWith('%')).toBe(true);

    act(() => dispatchPointer(divider, 'pointerup', { clientX: 80, clientY: 0 }));
    expect(h.current().layout.colFractions[0]).toBeCloseTo(0.6);
    expect(h.current().layout.colFractions[0] + h.current().layout.colFractions[1]).toBeCloseTo(1);
    expect(terminalPaneLayoutStore.loadForTab('t-col')?.colFractions[0]).toBeCloseTo(0.6);
    expect(h.container.style.getPropertyValue('--adl-term-col-fractions')).toBe('');
    expect(h.container.style.getPropertyValue('--adl-term-col-divider-0')).toBe('');
  });

  it('keeps the latest drag delta when released before the rAF frame fires (Important #3)', () => {
    const h = renderLayout({ activeTabId: 't-async', paneCount: 2, paneIds: ['p0', 'p1'] });
    const divider = document.createElement('div');

    act(() =>
      h
        .current()
        .handleColDividerPointerDown(0, fakePointerDown(divider, { clientX: 0, clientY: 0 })),
    );
    act(() => dispatchPointer(divider, 'pointermove', { clientX: 80, clientY: 0 }));
    // Release while the preview frame is still queued (never flushed).
    act(() => dispatchPointer(divider, 'pointerup', { clientX: 80, clientY: 0 }));

    expect(h.current().layout.colFractions[0]).toBeCloseTo(0.6);
    expect(terminalPaneLayoutStore.loadForTab('t-async')?.colFractions[0]).toBeCloseTo(0.6);
  });

  it('resizes a free pane by its east edge and persists the normalized rect', () => {
    terminalPaneLayoutStore.saveForTab('t-free-drag', {
      mode: 'free',
      colFractions: [1],
      rowFractions: [1],
      rects: { p0: { x: 0, y: 0, w: 0.5, h: 0.5 } },
    });
    const h = renderLayout({ activeTabId: 't-free-drag', paneCount: 1, paneIds: ['p0'] });
    const handle = document.createElement('div');
    const paneEl = h.container.querySelector<HTMLElement>('.adl-terminal-pane');

    act(() =>
      h
        .current()
        .handleFreeDragPointerDown('p0', 'e', fakePointerDown(handle, { clientX: 0, clientY: 0 })),
    );
    act(() => dispatchPointer(handle, 'pointermove', { clientX: 80, clientY: 0 }));
    act(() => flushRaf());

    expect(paneEl?.style.width).toBe('60%');

    act(() => dispatchPointer(handle, 'pointerup', { clientX: 80, clientY: 0 }));
    expect(h.current().layout.rects.p0.w).toBeCloseTo(0.6);
    expect(terminalPaneLayoutStore.loadForTab('t-free-drag')?.rects.p0.w).toBeCloseTo(0.6);
    // H1：teardown 不再清理内联几何（自由模式几何归 React 所有）；此处 hook 无 React
    // 重渲染，故保留拖拽期写入的预览值。旧实现会清空为 ''。
    expect(paneEl?.style.width).toBe('60%');
  });

  it('ignores a free drag for a pane id that is not in paneIds', () => {
    const h = renderLayout({ activeTabId: 't-ghost', paneCount: 1, paneIds: ['p0'] });
    const handle = document.createElement('div');
    const before = h.current().layout.rects;

    act(() =>
      h
        .current()
        .handleFreeDragPointerDown(
          'ghost',
          'e',
          fakePointerDown(handle, { clientX: 0, clientY: 0 }),
        ),
    );
    act(() => dispatchPointer(handle, 'pointermove', { clientX: 80, clientY: 0 }));
    act(() => flushRaf());
    act(() => dispatchPointer(handle, 'pointerup', { clientX: 80, clientY: 0 }));

    expect(h.current().layout.rects).toBe(before);
    expect(h.current().layout.rects).toEqual({});
  });

  it('cleans up an in-flight drag preview on unmount', () => {
    const h = renderLayout({ activeTabId: 't-unmount', paneCount: 2, paneIds: ['p0', 'p1'] });
    const divider = document.createElement('div');

    act(() =>
      h
        .current()
        .handleColDividerPointerDown(0, fakePointerDown(divider, { clientX: 0, clientY: 0 })),
    );
    act(() => dispatchPointer(divider, 'pointermove', { clientX: 80, clientY: 0 }));
    act(() => flushRaf());
    expect(h.container.style.getPropertyValue('--adl-term-col-fractions')).not.toBe('');

    act(() => h.unmount());
    expect(h.container.style.getPropertyValue('--adl-term-col-fractions')).toBe('');
  });
});

describe('useTerminalPaneLayout drag scale (grid content, not scroll viewport)', () => {
  it('measureGridContent prefers the inner grid element over the outer scroll viewport', () => {
    const outer = makeOverflowContainer(
      ['p0', 'p1'],
      { width: 1600, height: 900 },
      { width: 800, height: 600 },
    );
    expect(measureGridContent(outer)).toEqual({ width: 1600, height: 900 });
    // 容器自身即网格（简化 DOM / 测试）时直接用容器
    const self = makeContainer(['p0', 'p1'], 800, 600);
    expect(measureGridContent(self)).toEqual({ width: 800, height: 600 });
    expect(measureGridContent(null)).toEqual({ width: 1, height: 1 });
  });

  it('scales an equal column drag by grid content width, not the overflowing viewport', () => {
    // 外层视口 800px，网格 min-width 1600px 溢出：160px 拖动 = 160/1600 = 0.1 → 0.6。
    // 若误用外层视口（800）当分母，将得到 0.7。
    const container = makeOverflowContainer(
      ['p0', 'p1'],
      { width: 1600, height: 600 },
      { width: 800, height: 600 },
    );
    const h = renderLayout({
      activeTabId: 't-overflow-col',
      paneCount: 2,
      paneIds: ['p0', 'p1'],
      container,
    });
    const divider = document.createElement('div');

    act(() =>
      h
        .current()
        .handleColDividerPointerDown(0, fakePointerDown(divider, { clientX: 0, clientY: 0 })),
    );
    act(() => dispatchPointer(divider, 'pointermove', { clientX: 160, clientY: 0 }));
    act(() => dispatchPointer(divider, 'pointerup', { clientX: 160, clientY: 0 }));

    expect(h.current().layout.colFractions[0]).toBeCloseTo(0.6);
  });

  it('scales a free edge drag by grid content size, not the overflowing viewport', () => {
    terminalPaneLayoutStore.saveForTab('t-overflow-free', {
      mode: 'free',
      colFractions: [1],
      rowFractions: [1],
      rects: { p0: { x: 0, y: 0, w: 0.5, h: 0.5 } },
    });
    const container = makeOverflowContainer(
      ['p0'],
      { width: 1600, height: 800 },
      { width: 800, height: 600 },
    );
    const h = renderLayout({
      activeTabId: 't-overflow-free',
      paneCount: 1,
      paneIds: ['p0'],
      container,
    });
    const handle = document.createElement('div');

    act(() =>
      h
        .current()
        .handleFreeDragPointerDown('p0', 'e', fakePointerDown(handle, { clientX: 0, clientY: 0 })),
    );
    act(() => dispatchPointer(handle, 'pointermove', { clientX: 160, clientY: 0 }));
    act(() => dispatchPointer(handle, 'pointerup', { clientX: 160, clientY: 0 }));

    // 160/1600 = 0.1 → 0.5 + 0.1 = 0.6（误用外层 800 则为 0.7）
    expect(h.current().layout.rects.p0.w).toBeCloseTo(0.6);
  });
});

describe('useTerminalPaneLayout divider no-op click', () => {
  it('does not commit or persist when a divider drag produces no movement', () => {
    const h = renderLayout({ activeTabId: 't-noop', paneCount: 2, paneIds: ['p0', 'p1'] });
    const divider = document.createElement('div');
    const before = h.current().layout;

    act(() =>
      h
        .current()
        .handleColDividerPointerDown(0, fakePointerDown(divider, { clientX: 40, clientY: 0 })),
    );
    act(() => dispatchPointer(divider, 'pointerup', { clientX: 40, clientY: 0 }));

    expect(h.current().layout).toBe(before);
    flushCrossSliceWrites();
    expect(terminalPaneLayoutStore.loadForTab('t-noop')).toBeUndefined();
  });

  it('still commits when the divider actually moves', () => {
    const h = renderLayout({ activeTabId: 't-moved', paneCount: 2, paneIds: ['p0', 'p1'] });
    const divider = document.createElement('div');

    act(() =>
      h
        .current()
        .handleColDividerPointerDown(0, fakePointerDown(divider, { clientX: 0, clientY: 0 })),
    );
    act(() => dispatchPointer(divider, 'pointermove', { clientX: 80, clientY: 0 }));
    act(() => dispatchPointer(divider, 'pointerup', { clientX: 80, clientY: 0 }));

    expect(h.current().layout.colFractions[0]).toBeCloseTo(0.6);
    flushCrossSliceWrites();
    expect(terminalPaneLayoutStore.loadForTab('t-moved')?.colFractions[0]).toBeCloseTo(0.6);
  });

  it('does not commit or persist when a free drag produces no movement (M3)', () => {
    const h = renderLayout({ activeTabId: 't-free-noop', paneCount: 1, paneIds: ['p0'] });
    const handle = document.createElement('div');
    const before = h.current().layout;

    act(() =>
      h
        .current()
        .handleFreeDragPointerDown('p0', 'e', fakePointerDown(handle, { clientX: 40, clientY: 0 })),
    );
    act(() => dispatchPointer(handle, 'pointerup', { clientX: 40, clientY: 0 }));

    expect(h.current().layout).toBe(before);
    flushCrossSliceWrites();
    expect(terminalPaneLayoutStore.loadForTab('t-free-noop')).toBeUndefined();
  });
});
