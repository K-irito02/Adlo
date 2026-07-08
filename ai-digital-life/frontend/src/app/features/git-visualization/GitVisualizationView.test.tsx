import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { GitVisualizationView } from './GitVisualizationView';

// Mock ECharts to avoid canvas rendering in jsdom
vi.mock('./echartsSetup', () => ({
  echarts: {
    init: vi.fn(() => ({
      setOption: vi.fn(),
      resize: vi.fn(),
      dispose: vi.fn(),
    })),
    use: vi.fn(),
  },
  graphic: { LinearGradient: vi.fn() },
}));

vi.mock('@hooks/useResolvedTheme', () => ({
  useResolvedTheme: vi.fn(() => 'light'),
}));

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: vi.fn(() => ({
    t: {
      gitVisCommitGraph: 'Commit Network',
      gitVisCalendarHeatmap: 'Calendar Heatmap',
      gitVisClockHeatmap: 'Clock Heatmap',
      gitVisContributorStats: 'Contributors',
      gitVisFileTreemap: 'File Treemap',
      gitVisCodeLineEvolution: 'Code Line Evolution',
      gitVisCollabSankey: 'Collaboration Sankey',
      gitVisCommitGraphDesc: 'desc',
      gitVisCalendarHeatmapDesc: 'desc',
      gitVisClockHeatmapDesc: 'desc',
      gitVisContributorStatsDesc: 'desc',
      gitVisFileTreemapDesc: 'desc',
      gitVisCodeLineEvolutionDesc: 'desc',
      gitVisCollabSankeyDesc: 'desc',
      gitVisMockDataNote: 'note',
    },
    formatT: vi.fn(),
  })),
  // NOTE: 24 chart-internal i18n keys (gitVisChartLegendHigh, etc.) are intentionally
  // omitted — chart sub-components only export option objects rendered by a mocked
  // echarts instance, so i18n key resolution is never exercised in this test.
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
