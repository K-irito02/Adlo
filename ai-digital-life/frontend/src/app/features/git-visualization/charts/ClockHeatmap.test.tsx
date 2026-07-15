import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ClockHeatmap } from './ClockHeatmap';

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: {
      gitVisCommits: 'commits',
    },
    formatT: vi.fn(),
  }),
}));

vi.mock('../hooks/useBklitTheme', () => ({
  useBklitTheme: () => ({
    heatmapColors: ['#f1f5f9', '#bfdbfe', '#60a5fa', '#3b82f6', '#1d4ed8'],
    background: '#fff',
    muted: '#94a3b8',
  }),
}));

describe('ClockHeatmap', () => {
  it('renders SVG', () => {
    const { container } = render(<ClockHeatmap />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
