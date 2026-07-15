import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { CollabSankey } from './CollabSankey';

vi.mock('../hooks/useBklitTheme', () => ({
  useBklitTheme: () => ({
    accent: '#3b82f6',
    muted: '#94a3b8',
    background: '#ffffff',
    text: '#1e293b',
    seriesColors: ['#3b82f6'],
    heatmapColors: [],
    grid: '#e2e8f0',
    tooltipBg: '#1e293b',
    tooltipText: '#f8fafc',
  }),
}));

describe('CollabSankey', () => {
  it('renders SVG without crashing', () => {
    const { container } = render(<CollabSankey />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
