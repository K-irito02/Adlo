import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import { BranchGraph } from './BranchGraph';
import { getAvatar, getCachedAvatarUrl } from '../utils/avatarCache';
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
    refs: [],
  })),
  edges: commitEdges.map((e) => ({
    from: `node-${nodeIdToIndex.get(e.source)}`,
    to: `node-${nodeIdToIndex.get(e.target)}`,
  })),
  branches: allBranches,
};

afterEach(() => {
  cleanup();
  // Reset avatarCache mock to default (null) between tests so per-test
  // overrides in integration tests do not leak into other tests.
  vi.mocked(getAvatar).mockResolvedValue(null);
  vi.mocked(getCachedAvatarUrl).mockReturnValue(null);
});

vi.mock('../utils/avatarCache', () => ({
  getAvatar: vi.fn().mockResolvedValue(null),
  getCachedAvatarUrl: vi.fn().mockReturnValue(null),
}));

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
      gitVisLocalOnly: 'local only',
    },
    formatT: vi.fn(),
  })),
}));

describe('BranchGraph', () => {
  it('shows skeleton rows + loading label when status is loading', () => {
    const { container, getByText } = render(
      <BranchGraph status="loading" loadingLabel="Loading chart..." />,
    );
    expect(getByText('Loading chart...')).toBeInTheDocument();
    expect(container.querySelectorAll('.adl-branch-graph__skeleton-row').length).toBeGreaterThan(0);
  });

  it('mirrors the ready structure while loading: tag row + lanes panel + table header', () => {
    const { container } = render(<BranchGraph status="loading" loadingLabel="Loading chart..." />);
    expect(container.querySelectorAll('.adl-branch-graph__skeleton-tag').length).toBeGreaterThan(0);
    // Lanes panel is a linked-list SVG: lane lines + edges + node circles.
    expect(container.querySelector('.adl-branch-graph__skeleton-lanes-svg')).toBeInTheDocument();
    expect(
      container.querySelectorAll('.adl-branch-graph__skeleton-lane-line').length,
    ).toBeGreaterThan(0);
    expect(
      container.querySelectorAll('.adl-branch-graph__skeleton-lane-edge').length,
    ).toBeGreaterThan(0);
    expect(
      container.querySelectorAll('.adl-branch-graph__skeleton-lane-node').length,
    ).toBeGreaterThan(0);
    expect(container.querySelector('.adl-branch-graph__skeleton-table-header')).toBeInTheDocument();
    // Table header mirrors the ready four columns.
    expect(
      container.querySelectorAll(
        '.adl-branch-graph__skeleton-table-header .adl-branch-graph__skeleton-cell',
      ).length,
    ).toBe(4);
  });

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

  it('handles row mouse enter/leave', () => {
    const { container } = render(<BranchGraph data={mockData} />);
    const rows = container.querySelectorAll('.adl-branch-graph__row');
    // Row hover now drives SVG node enlargement via hoveredRowId state
    expect(() => {
      fireEvent.mouseEnter(rows[0]);
      fireEvent.mouseLeave(rows[0]);
    }).not.toThrow();
  });

  it('enlarges the corresponding SVG node on row hover', () => {
    const { container } = render(<BranchGraph data={mockData} />);
    const rows = container.querySelectorAll('.adl-branch-graph__row');
    const svg = container.querySelector('.adl-branch-graph__svg');
    expect(svg).toBeTruthy();

    // Find all node circles/rects (exclude tag outer rings which use fill="none")
    const nodeCircles = svg!.querySelectorAll('circle[fill]:not([fill="none"])');
    const nodeRects = svg!.querySelectorAll('rect');
    const hasNodes = nodeCircles.length > 0 || nodeRects.length > 0;
    expect(hasNodes).toBe(true);

    // Capture the first node's radius/size before hover
    const firstCircle = nodeCircles[0] as SVGCircleElement | undefined;
    const firstRect = nodeRects[0] as SVGRectElement | undefined;
    const rBefore = firstCircle ? Number(firstCircle.getAttribute('r')) : 0;
    const wBefore = firstRect ? Number(firstRect.getAttribute('width')) : 0;

    // Hover over the first row to trigger node enlargement
    fireEvent.mouseEnter(rows[0]);

    const circlesAfter = svg!.querySelectorAll('circle[fill]:not([fill="none"])');
    const rectsAfter = svg!.querySelectorAll('rect');
    const firstCircleAfter = circlesAfter[0] as SVGCircleElement | undefined;
    const firstRectAfter = rectsAfter[0] as SVGRectElement | undefined;

    // At least one node type should show enlargement (r or width increased)
    const rAfter = firstCircleAfter ? Number(firstCircleAfter.getAttribute('r')) : rBefore;
    const wAfter = firstRectAfter ? Number(firstRectAfter.getAttribute('width')) : wBefore;
    const enlarged = rAfter > rBefore || wAfter > wBefore;
    expect(enlarged).toBe(true);
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

    // Step 1: Hover over row to make info button appear
    fireEvent.mouseEnter(rows[0]);

    // Step 2: Wait for info button to render (state update)
    const infoBtn = await vi.waitFor(() => {
      const btn = rows[0].querySelector('.adl-branch-graph__info-btn');
      expect(btn).toBeTruthy();
      return btn;
    });

    // Step 3: Hover over info button to trigger tooltip
    fireEvent.mouseEnter(infoBtn!);

    // Step 4: Wait for tooltip card to appear (Tooltip has showDelay)
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

  it('renders author avatars with local pixel avatar as initial src', () => {
    // After the pixel-avatar-first refactor, the <img> starts with a local
    // data URI (SVG identicon) so it never shows a broken image while the
    // real GitHub/Gravatar avatar loads asynchronously.
    const { container } = render(<BranchGraph data={mockData} />);
    const imgs = container.querySelectorAll<HTMLImageElement>('img.adl-author-avatar');
    expect(imgs.length).toBeGreaterThan(0);
    imgs.forEach((img) => {
      const src = img.getAttribute('src') || '';
      expect(src.startsWith('data:image/svg+xml')).toBe(true);
    });
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

  it('replaces pixel avatar with cached avatar after async load', async () => {
    // Mock getAvatar to return a fake blob URL so the avatar should swap
    const fakeBlobUrl = 'blob:fake-avatar-url';
    vi.mocked(getAvatar).mockResolvedValue(fakeBlobUrl);

    const { container } = render(<BranchGraph data={mockData} />);
    const imgs = container.querySelectorAll<HTMLImageElement>('img.adl-author-avatar');

    // Initially all should be pixel avatars (synchronous render)
    imgs.forEach((img) => {
      expect(img.getAttribute('src')?.startsWith('data:image/svg+xml')).toBe(true);
    });

    // After async resolution, they should be replaced with cached URL
    await vi.waitFor(() => {
      const updatedImgs = container.querySelectorAll<HTMLImageElement>('img.adl-author-avatar');
      updatedImgs.forEach((img) => {
        expect(img.getAttribute('src')).toBe(fakeBlobUrl);
      });
    });
  });

  it('keeps pixel avatar when getAvatar returns null', async () => {
    vi.mocked(getAvatar).mockResolvedValue(null);

    const { container } = render(<BranchGraph data={mockData} />);
    const imgs = container.querySelectorAll<HTMLImageElement>('img.adl-author-avatar');

    await vi.waitFor(() => {
      imgs.forEach((img) => {
        expect(img.getAttribute('src')?.startsWith('data:image/svg+xml')).toBe(true);
      });
    });
  });

  it('uses cached avatar immediately and triggers SWR revalidate', async () => {
    // Mock getCachedAvatarUrl to return a cached URL (simulates L1 hit)
    const cachedUrl = 'blob:cached-avatar-url';
    vi.mocked(getCachedAvatarUrl).mockReturnValue(cachedUrl);
    // getAvatar returns the same URL (fresh cache — no revalidation needed)
    vi.mocked(getAvatar).mockResolvedValue(cachedUrl);

    const { container } = render(<BranchGraph data={mockData} />);
    const imgs = container.querySelectorAll<HTMLImageElement>('img.adl-author-avatar');

    // Immediately renders with cached URL (no pixel-avatar flicker)
    imgs.forEach((img) => {
      expect(img.getAttribute('src')).toBe(cachedUrl);
    });

    // SWR contract: getAvatar is still called to check freshness
    await vi.waitFor(() => {
      expect(getAvatar).toHaveBeenCalled();
    });
  });
});
