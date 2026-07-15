import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { CommitTimeline } from './CommitTimeline';

vi.mock('../hooks/useBklitTheme', () => ({
  useBklitTheme: () => ({
    accent: '#3b82f6',
    muted: '#94a3b8',
    text: '#1e293b',
    background: '#fff',
    grid: '#e2e8f0',
    seriesColors: ['#3b82f6'],
    heatmapColors: [],
    tooltipBg: '#1e293b',
    tooltipText: '#f8fafc',
  }),
}));

describe('CommitTimeline', () => {
  it('renders SVG with circles', () => {
    const { container } = render(<CommitTimeline />);
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.querySelectorAll('circle').length).toBeGreaterThan(0);
  });
});
