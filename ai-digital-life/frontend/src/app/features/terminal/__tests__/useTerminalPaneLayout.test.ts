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
import { useTerminalPaneLayout } from '../useTerminalPaneLayout';

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

const RAF_ORIGINAL = globalThis.requestAnimationFrame;
const CAF_ORIGINAL = globalThis.cancelAnimationFrame;

beforeAll(() => {
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  };
  globalThis.cancelAnimationFrame = () => {};
});

afterAll(() => {
  globalThis.requestAnimationFrame = RAF_ORIGINAL;
  globalThis.cancelAnimationFrame = CAF_ORIGINAL;
});

beforeEach(() => {
  localStorage.clear();
  terminalPaneLayoutStore.apply({});
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

interface Harness {
  container: HTMLDivElement;
  rerender: (props: { activeTabId: string | undefined; paneCount: number }) => void;
  current: () => ReturnType<typeof useTerminalPaneLayout>;
}

function renderLayout(initial: {
  activeTabId?: string;
  paneCount: number;
  paneIds: string[];
}): Harness {
  const container = makeContainer(initial.paneIds);
  const containerRef = { current: container } as RefObject<HTMLDivElement | null>;
  const { result, rerender } = renderHook(
    (props: { activeTabId?: string; paneCount: number }) =>
      useTerminalPaneLayout({
        containerRef,
        activeTabId: props.activeTabId,
        paneCount: props.paneCount,
      }),
    { initialProps: { activeTabId: initial.activeTabId, paneCount: initial.paneCount } },
  );
  return {
    container,
    rerender: (props) => rerender(props),
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
    const h = renderLayout({ activeTabId: 't-empty', paneCount: 2, paneIds: ['p0', 'p1'] });
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

    act(() => h.rerender({ activeTabId: 't-b', paneCount: 2 }));
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

    act(() => h.rerender({ activeTabId: 't-grow', paneCount: 4 }));
    expect(h.current().layout.colFractions).toHaveLength(2);
    expect(h.current().layout.rowFractions).toHaveLength(2);
  });

  it('fills missing free rects with autoRectForIndex by grid index', () => {
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
    });
    expect(h.current().layout.rects).toEqual({
      p0: { x: 0, y: 0, w: 0.5, h: 0.5 },
      p1: autoRectForIndex(1, 4),
      p2: autoRectForIndex(2, 4),
      p3: autoRectForIndex(3, 4),
    });
  });
});

describe('useTerminalPaneLayout actions', () => {
  it('setMode persists through the store', () => {
    const h = renderLayout({ activeTabId: 't-mode', paneCount: 2, paneIds: ['p0', 'p1'] });
    act(() => h.current().setMode('free'));
    expect(h.current().layout.mode).toBe('free');

    flushCrossSliceWrites();
    expect(terminalPaneLayoutStore.loadForTab('t-mode')?.mode).toBe('free');
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

    const preview = h.container.style.getPropertyValue('--adl-term-col-fractions');
    expect(preview).toContain('fr');
    expect(preview.startsWith('0.6')).toBe(true);

    act(() => dispatchPointer(divider, 'pointerup', { clientX: 80, clientY: 0 }));
    expect(h.current().layout.colFractions[0]).toBeCloseTo(0.6);
    expect(h.current().layout.colFractions[0] + h.current().layout.colFractions[1]).toBeCloseTo(1);
    expect(terminalPaneLayoutStore.loadForTab('t-col')?.colFractions[0]).toBeCloseTo(0.6);
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

    expect(paneEl?.style.width).toBe('60%');

    act(() => dispatchPointer(handle, 'pointerup', { clientX: 80, clientY: 0 }));
    expect(h.current().layout.rects.p0.w).toBeCloseTo(0.6);
    expect(terminalPaneLayoutStore.loadForTab('t-free-drag')?.rects.p0.w).toBeCloseTo(0.6);
  });

  it('does not persist without an active tab id', () => {
    const h = renderLayout({ activeTabId: undefined, paneCount: 2, paneIds: ['p0', 'p1'] });
    act(() => h.current().setMode('free'));
    flushCrossSliceWrites();
    expect(terminalPaneLayoutStore.loadAll()).toEqual({});
  });
});
