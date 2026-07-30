import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { ChartBrush } from './chart-brush';
import { scaleTime } from '@visx/scale';

vi.mock('../chart-context', () => ({
  useChartStable: () => ({
    xScale: scaleTime({ domain: [new Date('2024-01-01'), new Date('2024-12-31')], range: [0, 500] }),
    innerWidth: 500,
    innerHeight: 60,
  }),
  useChartHover: () => ({ tooltipData: null, setTooltipData: () => {} }),
  useChart: () => ({
    xScale: scaleTime({ domain: [new Date('2024-01-01'), new Date('2024-12-31')], range: [0, 500] }),
    innerWidth: 500,
    innerHeight: 60,
    tooltipData: null,
    setTooltipData: () => {},
  }),
}));

describe('ChartBrush', () => {
  it('renders without crashing', () => {
    const onSel = vi.fn();
    const { container } = render(<svg width={500} height={60}><ChartBrush onSelectionChange={onSel} /></svg>);
    expect(container.querySelector('g')).toBeInTheDocument();
  });

  it('renders 5 rects (2 dim + 1 body + 2 handles)', () => {
    const onSel = vi.fn();
    const { container } = render(<svg width={500} height={60}><ChartBrush onSelectionChange={onSel} /></svg>);
    const rects = container.querySelectorAll('rect');
    expect(rects.length).toBe(5);
  });

  it('renders with initialSelection', () => {
    const onSel = vi.fn();
    const { container } = render(
      <svg width={500} height={60}>
        <ChartBrush
          onSelectionChange={onSel}
          initialSelection={{ start: new Date('2024-03-01'), end: new Date('2024-09-01') }}
        />
      </svg>
    );
    const rects = container.querySelectorAll('rect');
    expect(rects.length).toBe(5);
  });
});
