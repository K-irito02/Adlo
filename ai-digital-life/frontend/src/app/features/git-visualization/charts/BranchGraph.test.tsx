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

  it('filters by branch label click', () => {
    const { container } = render(<BranchGraph data={mockData} />);
    const labels = container.querySelectorAll('.adl-branch-graph__label');
    // Click a label to filter
    fireEvent.click(labels[0]);
    const filteredBranch = labels[0].textContent;
    const rows = container.querySelectorAll('.adl-branch-graph__row');
    // Non-matching rows should be dimmed
    const nonMatchingRows = [...rows].filter(
      (r) => r.getAttribute('data-branch') !== filteredBranch,
    );
    expect(nonMatchingRows.length).toBeGreaterThan(0);
    nonMatchingRows.forEach((el) => {
      expect((el as HTMLElement).style.opacity).toBe('0.25');
      expect(el.classList.contains('adl-branch-graph__row--dimmed')).toBe(true);
    });
    // Matching rows should have full opacity
    const matchingRows = [...rows].filter((r) => r.getAttribute('data-branch') === filteredBranch);
    matchingRows.forEach((el) => {
      expect((el as HTMLElement).style.opacity).toBe('1');
      expect(el.classList.contains('adl-branch-graph__row--dimmed')).toBe(false);
    });
    // Labels should reflect selection via data-indicator attribute
    const labelsAfter = container.querySelectorAll('.adl-branch-graph__label');
    expect(labelsAfter.length).toBeGreaterThan(0);
    const activeLabel = labelsAfter[0];
    expect(activeLabel.textContent).toBe(filteredBranch);
    expect(activeLabel.getAttribute('data-indicator')).toBe('true');
    // Non-selected labels should not have data-indicator
    for (let i = 1; i < labelsAfter.length; i++) {
      expect(labelsAfter[i].getAttribute('data-indicator')).toBeNull();
    }
    // Non-selected labels should have reduced opacity
    for (const label of labelsAfter) {
      if (label.textContent !== filteredBranch) {
        expect((label as HTMLElement).style.opacity).toBe('0.4');
      }
    }
    // Click active label again to clear filter
    fireEvent.click(activeLabel);
    const rowsAfterClear = container.querySelectorAll('.adl-branch-graph__row');
    const dimmedAfterClear = [...rowsAfterClear].filter((r) =>
      r.classList.contains('adl-branch-graph__row--dimmed'),
    );
    expect(dimmedAfterClear.length).toBe(0);
    // All labels should clear data-indicator after un-selection
    const labelsAfterClear = container.querySelectorAll('.adl-branch-graph__label');
    for (const label of labelsAfterClear) {
      expect(label.getAttribute('data-indicator')).toBeNull();
      expect((label as HTMLElement).style.opacity).toBe('1');
    }
  });
});
