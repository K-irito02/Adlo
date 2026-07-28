import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import { BranchGraph } from './BranchGraph';
import { commitNodes, commitEdges, allBranches } from '../../../../test-fixtures/gitVisMockData';
import type { RawBranchGraph } from '../adapters/chartDataAdapters';

const nodeIdToIndex = new Map(commitNodes.map((n, i) => [n.id, i]));
const mockData: RawBranchGraph = {
  nodes: commitNodes.map((n) => ({
    hash: n.hash,
    shortHash: n.hash.substring(0, 7),
    parentHashes: [],
    branch: n.branch,
    date: n.date,
    message: n.message,
    author: n.author,
    authorEmail: n.authorEmail,
    tag: n.tag,
  })),
  edges: commitEdges.map((e) => ({
    from: `node-${nodeIdToIndex.get(e.source)}`,
    to: `node-${nodeIdToIndex.get(e.target)}`,
  })),
  branches: allBranches,
};

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
      gitVisHash: 'HASH',
      gitVisMessage: 'MESSAGE',
      gitVisAuthor: 'AUTHOR',
      gitVisDate: 'DATE',
      gitVisProgressTooltip: '{label} vs remote: ahead {ahead}, behind {behind}',
      gitVisCopyHash: 'Copy hash',
    },
    formatT: vi.fn(),
  })),
}));

describe('BranchGraph', () => {
  it('renders commit rows', () => {
    const { container } = render(<BranchGraph data={mockData} />);
    const rows = container.querySelectorAll('.adl-branch-graph__row');
    expect(rows.length).toBe(31);
  });

  it('renders SVG lanes container', () => {
    const { container } = render(<BranchGraph data={mockData} />);
    const svg = container.querySelector('.adl-branch-graph__svg');
    expect(svg).toBeTruthy();
  });

  it('renders branch labels', () => {
    const { container } = render(<BranchGraph data={mockData} />);
    const labels = container.querySelectorAll('.adl-branch-graph__label');
    expect(labels.length).toBe(6);
  });

  it('shows tag badge for tagged commit', () => {
    const { container } = render(<BranchGraph data={mockData} />);
    const tags = container.querySelectorAll('.adl-branch-graph__tag');
    expect(tags.length).toBe(1);
    expect(tags[0].textContent).toBe('v1.0');
  });

  it('highlights row on hover', () => {
    const { container } = render(<BranchGraph data={mockData} />);
    const rows = container.querySelectorAll('.adl-branch-graph__row');
    fireEvent.mouseEnter(rows[0]);
    expect(rows[0].classList.contains('adl-branch-graph__row--hover')).toBe(true);
    fireEvent.mouseLeave(rows[0]);
    expect(rows[0].classList.contains('adl-branch-graph__row--hover')).toBe(false);
  });

  it('shows ahead/behind indicators when branchProgress provided', () => {
    const dataWithProgress = {
      ...mockData,
      branchProgress: { main: { ahead: 3, behind: 1, mergeBase: 'abc1234' } },
    };
    const { container } = render(<BranchGraph data={dataWithProgress} />);
    expect(container.querySelector('.adl-branch-graph__label-progress')?.textContent).toContain(
      '↑3',
    );
    expect(container.querySelector('.adl-branch-graph__label-progress')?.textContent).toContain(
      '↓1',
    );
  });

  it('renders tooltip card content on row hover', async () => {
    const { container } = render(<BranchGraph data={mockData} />);
    const rows = container.querySelectorAll('.adl-branch-graph__row');
    fireEvent.mouseEnter(rows[0]);

    await vi.waitFor(
      () => {
        const tooltip = document.body.querySelector('[data-testid="tooltip-content"]');
        expect(tooltip).toBeTruthy();
        expect(tooltip!.textContent).toContain('e7f8a9');
        expect(tooltip!.textContent).toContain('Release v2.0');
        expect(tooltip!.textContent).toContain('Alex');
        expect(tooltip!.textContent).toContain('alex@example.com');
      },
      { timeout: 2000 },
    );
  });

  it('shows Gravatar image for author instead of initial when email is valid', () => {
    const { container } = render(<BranchGraph data={mockData} />);
    const imgs = container.querySelectorAll<HTMLImageElement>('img.adl-author-avatar');
    let gravatarFound = false;
    imgs.forEach((img) => {
      const src = img.getAttribute('src') || '';
      if (src.includes('gravatar.com')) {
        gravatarFound = true;
      }
    });
    expect(gravatarFound).toBe(true);
  });

  it('shows author initial when image fails to load', () => {
    const { container } = render(<BranchGraph data={mockData} />);
    const imgs = container.querySelectorAll<HTMLImageElement>('img.adl-author-avatar');
    expect(imgs.length).toBeGreaterThan(0);

    fireEvent.error(imgs[0]);
    const imgsAfter = container.querySelectorAll<HTMLImageElement>('img.adl-author-avatar');
    expect(imgsAfter.length).toBeLessThan(imgs.length);
  });

  it('filters by branch label click', () => {
    const { container } = render(<BranchGraph data={mockData} />);
    const labels = container.querySelectorAll('.adl-branch-graph__label');
    // Click first label to filter by column
    fireEvent.click(labels[0]);
    const rows = container.querySelectorAll('.adl-branch-graph__row');
    // Some rows should be dimmed (different column), some not
    const dimmedRows = [...rows].filter((r) =>
      r.classList.contains('adl-branch-graph__row--dimmed'),
    );
    const nonDimmedRows = [...rows].filter(
      (r) => !r.classList.contains('adl-branch-graph__row--dimmed'),
    );
    expect(dimmedRows.length).toBeGreaterThan(0);
    expect(nonDimmedRows.length).toBeGreaterThan(0);
    dimmedRows.forEach((el) => {
      expect((el as HTMLElement).style.opacity).toBe('0.25');
    });
    nonDimmedRows.forEach((el) => {
      expect((el as HTMLElement).style.opacity).toBe('1');
    });
    // Clicked label should have data-indicator
    expect(labels[0].getAttribute('data-indicator')).toBe('true');
    // Non-selected labels should not have data-indicator
    for (let i = 1; i < labels.length; i++) {
      expect(labels[i].getAttribute('data-indicator')).toBeNull();
    }
    // Non-selected labels should have reduced opacity
    for (let i = 1; i < labels.length; i++) {
      expect((labels[i] as HTMLElement).style.opacity).toBe('0.4');
    }
    // Click active label again to clear filter
    fireEvent.click(labels[0]);
    const rowsAfterClear = container.querySelectorAll('.adl-branch-graph__row');
    const dimmedAfterClear = [...rowsAfterClear].filter((r) =>
      r.classList.contains('adl-branch-graph__row--dimmed'),
    );
    expect(dimmedAfterClear.length).toBe(0);
    rowsAfterClear.forEach((el) => {
      expect((el as HTMLElement).style.opacity).toBe('1');
    });
    // All labels should clear data-indicator after un-selection
    for (const label of container.querySelectorAll('.adl-branch-graph__label')) {
      expect(label.getAttribute('data-indicator')).toBeNull();
      expect((label as HTMLElement).style.opacity).toBe('1');
    }
  });
});
