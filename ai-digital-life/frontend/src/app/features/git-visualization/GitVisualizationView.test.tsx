import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { GitVisualizationView } from './GitVisualizationView';

vi.mock('@hooks/useResolvedTheme', () => ({
  useResolvedTheme: vi.fn(() => 'light'),
}));

vi.mock('../hooks/useBklitTheme', () => ({
  useBklitTheme: () => ({
    accent: '#3b82f6',
    muted: '#94a3b8',
    background: '#ffffff',
    text: '#1e293b',
    seriesColors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'],
    heatmapColors: ['#f1f5f9', '#bfdbfe', '#60a5fa', '#3b82f6', '#1d4ed8'],
    grid: '#e2e8f0',
    tooltipBg: '#1e293b',
    tooltipText: '#f8fafc',
  }),
}));

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: vi.fn(() => ({
    t: {
      gitVisCalendarHeatmap: 'Calendar Heatmap',
      gitVisClockHeatmap: 'Clock Heatmap',
      gitVisCodeLineEvo: 'Code Line Evolution',
      gitVisCollabSankey: 'Collaboration Sankey',
      gitVisCommitTimeline: 'Commit Timeline',
      gitVisContributorStats: 'Contributors',
      gitVisFileSunburst: 'File Sunburst',
      gitVisCalendarHeatmapDesc: 'desc',
      gitVisClockHeatmapDesc: 'desc',
      gitVisCodeLineEvoDesc: 'desc',
      gitVisCollabSankeyDesc: 'desc',
      gitVisCommitTimelineDesc: 'desc',
      gitVisContributorStatsDesc: 'desc',
      gitVisFileSunburstDesc: 'desc',
      gitVisMockDataNote: 'note',
    },
    formatT: vi.fn(),
  })),
}));

describe('GitVisualizationView', () => {
  it('renders 7 chart cards', () => {
    const { container } = render(<GitVisualizationView />);
    const cards = container.querySelectorAll('.adl-git-vis__card');
    expect(cards.length).toBe(7);
  });

  it('renders scroll container', () => {
    const { container } = render(<GitVisualizationView />);
    const scrollContainer = container.querySelector('.adl-git-vis__container');
    expect(scrollContainer).toBeTruthy();
  });

  it('renders mock data note', () => {
    const { container } = render(<GitVisualizationView />);
    const note = container.querySelector('.adl-git-vis__note');
    expect(note).toBeTruthy();
  });
});
