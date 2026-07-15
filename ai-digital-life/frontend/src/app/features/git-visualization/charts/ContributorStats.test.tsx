import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ContributorStats } from './ContributorStats';

vi.mock('../hooks/useBklitTheme', () => ({
  useBklitTheme: () => ({
    accent: '#3b82f6',
    text: '#1e293b',
    muted: '#94a3b8',
    grid: '#e2e8f0',
    tooltipBg: '#1e293b',
    tooltipText: '#f8fafc',
    background: '#ffffff',
    seriesColors: ['#3b82f6', '#10b981', '#ef4444'],
    heatmapColors: [],
  }),
}));

describe('ContributorStats', () => {
  it('renders SVG without crashing', () => {
    const { container } = render(<ContributorStats />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
