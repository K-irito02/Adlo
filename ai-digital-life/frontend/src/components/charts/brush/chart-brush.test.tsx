import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { ChartBrush } from './chart-brush';
import { scaleTime } from '@visx/scale';

const chartMock = vi.hoisted(() => ({
  containerRef: { current: null as HTMLDivElement | null },
}));

vi.mock('../chart-context', () => ({
  useChartStable: () => ({
    xScale: scaleTime({
      domain: [new Date('2024-01-01'), new Date('2024-12-31')],
      range: [0, 500],
    }),
    innerWidth: 500,
    innerHeight: 60,
    margin: { top: 8, right: 8, bottom: 8, left: 8 },
    containerRef: chartMock.containerRef,
  }),
  useChartHover: () => ({ tooltipData: null, setTooltipData: () => {} }),
  useChart: () => ({
    xScale: scaleTime({
      domain: [new Date('2024-01-01'), new Date('2024-12-31')],
      range: [0, 500],
    }),
    innerWidth: 500,
    innerHeight: 60,
    margin: { top: 8, right: 8, bottom: 8, left: 8 },
    containerRef: chartMock.containerRef,
    tooltipData: null,
    setTooltipData: () => {},
  }),
}));

describe('ChartBrush', () => {
  it('renders without crashing', () => {
    const onSel = vi.fn();
    const { container } = render(
      <svg width={500} height={60}>
        <ChartBrush onSelectionChange={onSel} />
      </svg>,
    );
    expect(container.querySelector('g')).toBeInTheDocument();
  });

  it('renders 5 rects (1 body + 2 hit targets + 2 handle pills)', () => {
    const onSel = vi.fn();
    const { container } = render(
      <svg width={500} height={60}>
        <ChartBrush onSelectionChange={onSel} />
      </svg>,
    );
    const rects = container.querySelectorAll('rect');
    expect(rects.length).toBe(5);
  });

  it('renders the handle pills as small vertically-centered rounded rects', () => {
    const onSel = vi.fn();
    const { container } = render(
      <svg width={500} height={60}>
        <ChartBrush
          onSelectionChange={onSel}
          initialSelection={{ start: new Date('2024-03-01'), end: new Date('2024-09-01') }}
        />
      </svg>,
    );
    const rects = container.querySelectorAll('rect');
    // Hit targets are full-height (60px) 8px-wide grab strips; pills are 24px tall.
    const hitTargets = Array.from(rects).filter(
      (r) => r.getAttribute('height') === '60' && r.getAttribute('width') === '8',
    );
    const pills = Array.from(rects).filter((r) => r.getAttribute('height') === '24');
    expect(hitTargets.length).toBe(2);
    expect(pills.length).toBe(2);
    for (const pill of pills) {
      expect(pill.getAttribute('width')).toBe('4');
      expect(pill.getAttribute('rx')).toBe('2');
      expect(Number(pill.getAttribute('y'))).toBe((60 - 24) / 2);
    }
  });

  it('renders with initialSelection', () => {
    const onSel = vi.fn();
    const { container } = render(
      <svg width={500} height={60}>
        <ChartBrush
          onSelectionChange={onSel}
          initialSelection={{ start: new Date('2024-03-01'), end: new Date('2024-09-01') }}
        />
      </svg>,
    );
    const rects = container.querySelectorAll('rect');
    expect(rects.length).toBe(5);
  });

  it('renders the dim outer panes as an HTML portal overlay (no SVG backdrop-filter)', () => {
    const onSel = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    chartMock.containerRef.current = host;
    render(
      <svg width={500} height={60}>
        <ChartBrush
          onSelectionChange={onSel}
          initialSelection={{ start: new Date('2024-03-01'), end: new Date('2024-09-01') }}
        />
      </svg>,
    );
    const panes = Array.from(host.querySelectorAll('[aria-hidden="true"] > div')) as HTMLElement[];
    expect(panes.length).toBe(2);
    const [left, right] = panes;
    expect(left.style.backdropFilter).toBe('blur(1.5px)');
    expect(left.style.pointerEvents).toBe('none');
    expect(parseFloat(left.style.top)).toBe(8);
    expect(parseFloat(left.style.left)).toBe(8);
    expect(parseFloat(left.style.height)).toBe(60);
    expect(parseFloat(left.style.width)).toBeGreaterThan(0);
    expect(parseFloat(right.style.width)).toBeGreaterThan(0);
    document.body.removeChild(host);
    chartMock.containerRef.current = null;
  });

  it('clamps blurPx to the 0–5 range', () => {
    const onSel = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    chartMock.containerRef.current = host;
    render(
      <svg width={500} height={60}>
        <ChartBrush
          onSelectionChange={onSel}
          blurPx={99}
          initialSelection={{ start: new Date('2024-03-01'), end: new Date('2024-09-01') }}
        />
      </svg>,
    );
    const left = host.querySelector('[aria-hidden="true"] > div') as HTMLElement;
    expect(left.style.backdropFilter).toBe('blur(5px)');
    document.body.removeChild(host);
    chartMock.containerRef.current = null;
  });

  it('converts pointer drag delta by innerWidth (not svg width)', () => {
    // jsdom lacks PointerEvent; provide a local MouseEvent-based stand-in so
    // React's onPointerDown/onPointerMove handlers receive clientX coords.
    class TestPointerEvent extends MouseEvent {
      readonly pointerId: number;
      constructor(
        type: string,
        init: MouseEventInit & { clientX?: number; clientY?: number; pointerId?: number },
      ) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
      }
    }
    const onSel = vi.fn();
    const { container } = render(
      <svg width={500} height={60}>
        <ChartBrush
          onSelectionChange={onSel}
          initialSelection={{ start: new Date('2024-03-01'), end: new Date('2024-09-01') }}
        />
      </svg>,
    );
    // SVG width is 516 (500 innerWidth + 8px left/right margins); the scale
    // range is [0, innerWidth] so a 100px drag must map to 100/500 = 0.2 of
    // the domain — not 100/516.
    const originalGetRect = Element.prototype.getBoundingClientRect;
    const originalCapture = Element.prototype.setPointerCapture;
    const originalRelease = Element.prototype.releasePointerCapture;
    Element.prototype.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 516,
        height: 60,
        right: 516,
        bottom: 60,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
    try {
      const panRect = container.querySelector('rect[style*="cursor: grab"]') as Element;
      panRect.dispatchEvent(
        new TestPointerEvent('pointerdown', { pointerId: 1, clientX: 200, bubbles: true }),
      );
      panRect.dispatchEvent(
        new TestPointerEvent('pointermove', { pointerId: 1, clientX: 300, bubbles: true }),
      );
      panRect.dispatchEvent(
        new TestPointerEvent('pointerup', { pointerId: 1, clientX: 300, bubbles: true }),
      );
      const last = onSel.mock.calls.at(-1)?.[0] as { start: Date };
      expect(last).toBeTruthy();
      const fullSpanMs = new Date('2024-12-31').getTime() - new Date('2024-01-01').getTime();
      const initialMs = new Date('2024-03-01').getTime();
      expect(Math.abs(last.start.getTime() - initialMs - 0.2 * fullSpanMs)).toBeLessThan(5);
    } finally {
      Element.prototype.getBoundingClientRect = originalGetRect;
      Element.prototype.setPointerCapture = originalCapture;
      Element.prototype.releasePointerCapture = originalRelease;
    }
  });

  it('renders a diagonal pattern inside the selection window when selectionPattern is set', () => {
    const onSel = vi.fn();
    const { container } = render(
      <svg width={500} height={60}>
        <ChartBrush
          onSelectionChange={onSel}
          initialSelection={{ start: new Date('2024-03-01'), end: new Date('2024-09-01') }}
          selectionPattern={{ preset: 'diagonal', color: 'var(--chart-brush-pattern)' }}
        />
      </svg>,
    );
    // pattern def + 5 base rects + 1 pattern-filled rect
    expect(container.querySelector('defs')).toBeInTheDocument();
    expect(container.querySelector('pattern')).toBeInTheDocument();
    const patternFilled = Array.from(container.querySelectorAll('rect')).find((r) =>
      (r.getAttribute('fill') ?? '').startsWith('url(#'),
    );
    expect(patternFilled).toBeTruthy();
    expect(Number(patternFilled?.getAttribute('width'))).toBeGreaterThan(0);
    // fill-opacity is driven by the theme token (defaults to `--chart-brush-pattern-opacity`).
    expect(patternFilled?.getAttribute('fill-opacity')).toBe('var(--chart-brush-pattern-opacity)');
    // Pattern stroke must use the theme token (var resolves in both light/dark).
    const patternStroke = container.querySelector('pattern path');
    expect(patternStroke?.getAttribute('stroke')).toBe('var(--chart-brush-pattern)');
  });
});
