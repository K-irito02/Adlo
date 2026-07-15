import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { FileSunburst } from './FileSunburst';

vi.mock('../hooks/useBklitTheme', () => ({
  useBklitTheme: () => ({
    seriesColors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'],
    background: '#fff',
    text: '#000',
    muted: '#94a3b8',
    heatmapColors: [],
    grid: '#e2e8f0',
    tooltipBg: '#1e293b',
    tooltipText: '#f8fafc',
    accent: '#3b82f6',
  }),
}));
describe('FileSunburst', () => {
  it('renders SVG with arcs', () => {
    const { container } = render(<FileSunburst />);
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.querySelectorAll('path').length).toBeGreaterThan(0);
  });
});
