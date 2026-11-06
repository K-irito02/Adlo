import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import React, { useEffect } from 'react';
import { HeatmapInteractionProvider, useHeatmapInteraction } from './heatmap-context';
import { HeatmapLegend } from './heatmap-legend';

vi.mock('motion/react', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target, tag: string) =>
        function MotionTag({ children, animate, ...rest }: Record<string, unknown>) {
          const animation = animate as { opacity?: number; scale?: number } | undefined;
          return React.createElement(
            tag === 'default' ? 'div' : tag,
            {
              ...rest,
              'data-opacity': animation?.opacity,
              'data-scale': animation?.scale,
            },
            children as React.ReactNode,
          );
        },
    },
  ),
}));

function TooltipSeed({ count }: { count: number }) {
  const { setTooltipData } = useHeatmapInteraction();

  useEffect(() => {
    setTooltipData({ column: 0, row: 0, count, x: 0, y: 0 });
    return () => setTooltipData(null);
  }, [count, setTooltipData]);

  return null;
}

describe('HeatmapLegend level resolver wiring', () => {
  it('uses the provided resolver to highlight the tooltip level', () => {
    const { container } = render(
      <HeatmapInteractionProvider>
        <TooltipSeed count={4} />
        <HeatmapLegend levelForCount={(count) => (count === 4 ? 1 : 4)} />
      </HeatmapInteractionProvider>,
    );

    const swatches = [...container.querySelectorAll('[data-opacity]')].map((element) =>
      element.getAttribute('data-opacity'),
    );

    // Level 1 is highlighted (opacity 1); the other four swatches dim to 0.3.
    expect(swatches).toHaveLength(5);
    expect(swatches[0]).toBe('0.3');
    expect(swatches[1]).toBe('1');
    expect(swatches.slice(2)).toEqual(['0.3', '0.3', '0.3']);
  });
});
