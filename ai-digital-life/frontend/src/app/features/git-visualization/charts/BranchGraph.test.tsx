import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import { BranchGraph } from './BranchGraph';

afterEach(() => {
  cleanup();
});

vi.mock('@hooks/useResolvedTheme', () => ({
  useResolvedTheme: vi.fn(() => 'light'),
}));

vi.mock('../hooks/useBklitTheme', () => ({
  useBklitTheme: () => ({
    accent: '#3b82f6',
    muted: '#94a3b8',
    background: '#ffffff',
    text: '#1e293b',
    seriesColors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'],
    heatmapColors: ['#f1f5f9', '#bfdbfe', '#60a5fa', '#3b82f6', '#1d4ed8'],
    grid: '#e2e8f0',
    tooltipBg: '#1e293b',
    tooltipText: '#f8fafc',
  }),
}));

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: vi.fn(() => ({
    t: {
      gitVisBranchGraph: 'Branch Graph',
      gitVisBranchGraphDesc: 'desc',
      gitVisBranch: 'Branch',
      gitVisBranchGraphFilterHint: 'Click to filter by branch',
    },
    formatT: vi.fn(),
  })),
}));

describe('BranchGraph', () => {
  it('renders commit rows', () => {
    const { container } = render(<BranchGraph />);
    const rows = container.querySelectorAll('.adl-branch-graph__row');
    expect(rows.length).toBe(31);
  });

  it('renders SVG lanes container', () => {
    const { container } = render(<BranchGraph />);
    const svg = container.querySelector('.adl-branch-graph__svg');
    expect(svg).toBeTruthy();
  });

  it('renders branch labels', () => {
    const { container } = render(<BranchGraph />);
    const labels = container.querySelectorAll('.adl-branch-graph__label');
    expect(labels.length).toBe(7);
  });

  it('shows tag badge for tagged commit', () => {
    const { container } = render(<BranchGraph />);
    const tags = container.querySelectorAll('.adl-branch-graph__tag');
    expect(tags.length).toBe(1);
    expect(tags[0].textContent).toBe('v1.0');
  });

  it('highlights row on hover', () => {
    const { container } = render(<BranchGraph />);
    const rows = container.querySelectorAll('.adl-branch-graph__row');
    fireEvent.mouseEnter(rows[0]);
    expect(rows[0].classList.contains('adl-branch-graph__row--hover')).toBe(true);
    fireEvent.mouseLeave(rows[0]);
    expect(rows[0].classList.contains('adl-branch-graph__row--hover')).toBe(false);
  });

  it('filters by branch label click', () => {
    const { container } = render(<BranchGraph />);
    const labels = container.querySelectorAll('.adl-branch-graph__label');
    fireEvent.click(labels[0]);
    const rows = container.querySelectorAll('.adl-branch-graph__row');
    const mainRows = [...rows].filter(r => r.getAttribute('data-branch') === 'main');
    expect(mainRows.length).toBeGreaterThan(0);
    // Click again to deselect
    fireEvent.click(labels[0]);
    const rowsAfter = container.querySelectorAll('.adl-branch-graph__row--dimmed');
    expect(rowsAfter.length).toBe(0);
  });
});
