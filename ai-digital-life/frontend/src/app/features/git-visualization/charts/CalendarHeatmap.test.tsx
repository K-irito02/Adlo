import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { CalendarHeatmap } from './CalendarHeatmap';

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: {
      gitVisContribution: 'contribution',
      gitVisContributions: 'contributions',
    },
    locale: 'en-US',
    formatT: vi.fn(),
  }),
}));

vi.mock('@visx/responsive', () => ({
  ParentSize: ({
    children,
  }: {
    children: (args: { width: number; height: number }) => React.ReactNode;
  }) => children({ width: 600, height: 200 }),
}));

describe('CalendarHeatmap', () => {
  it('renders SVG', () => {
    const { container } = render(<CalendarHeatmap />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
