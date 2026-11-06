import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import { BranchGraph } from './BranchGraph';
import { getRefLabelColor } from '../utils/branchLabelColors';
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
    refs: n.refs,
  })),
  edges: commitEdges.map((e) => ({
    from: `node-${nodeIdToIndex.get(e.source)}`,
    to: `node-${nodeIdToIndex.get(e.target)}`,
  })),
  branches: allBranches,
};

afterEach(() => {
  cleanup();
  window.localStorage.removeItem('adl-git-vis:branch-colors');
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
      gitVisProgressBase: 'base',
      gitVisMergedIntoMain: 'merged into main',
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

  it('locks the table header to single-line labels and the shared column template', () => {
    // Narrow panels must keep every header on one line (a wrapped CJK header
    // changes the row height and desyncs the fixed-height lane SVG). The four
    // full-label titles give truncated headers a hover fallback, and the
    // CSS-variable template keeps the header, rows and skeleton in lockstep.
    const { container } = render(<BranchGraph data={mockData} />);
    const header = container.querySelector('.adl-branch-graph__header')!;
    const headerSpans = Array.from(header.querySelectorAll('span'));
    // Exactly four headers — asserting the count keeps the title list from
    // silently drifting out of sync with the columns.
    expect(headerSpans).toHaveLength(4);
    expect(headerSpans.map((s) => s.getAttribute('title'))).toEqual([
      'HASH',
      'MESSAGE',
      'AUTHOR',
      'DATE',
    ]);
    expect((header as HTMLElement).style.gridTemplateColumns).toBe(
      'var(--adl-branch-graph-table-cols)',
    );
    // Data rows share the same template so header and lanes stay aligned.
    const row = container.querySelector('.adl-branch-graph__row') as HTMLElement;
    expect(row.style.gridTemplateColumns).toBe('var(--adl-branch-graph-table-cols)');
  });

  it('renders SVG lanes container', () => {
    const { container } = render(<BranchGraph data={mockData} />);
    const svg = container.querySelector('.adl-branch-graph__svg');
    expect(svg).toBeTruthy();
  });

  it('renders one branch label per local branch', () => {
    const { container } = render(<BranchGraph data={mockData} />);
    const labels = container.querySelectorAll('.adl-branch-graph__label');
    expect(labels.length).toBe(7);
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

  it('filters by branch label click', async () => {
    const { container } = render(<BranchGraph data={mockData} />);
    const labels = container.querySelectorAll('.adl-branch-graph__label');
    // Click the first label = mainline (sorted mainline-first). Rows not owned
    // by mainline (its first-parent spine: a1,a2,a3,a7,a8,a10,a14,a15 = 8) are dimmed.
    fireEvent.click(labels[0]);

    await vi.waitFor(() => {
      const rows = container.querySelectorAll('.adl-branch-graph__row');
      const dimmedRows = [...rows].filter((r) =>
        r.classList.contains('adl-branch-graph__row--dimmed'),
      );
      const nonDimmedRows = [...rows].filter(
        (r) => !r.classList.contains('adl-branch-graph__row--dimmed'),
      );
      expect(dimmedRows.length).toBeGreaterThan(0);
      expect(nonDimmedRows.length).toBeGreaterThan(0);
    });

    const rows = container.querySelectorAll('.adl-branch-graph__row');
    const dimmedRows = [...rows].filter((r) =>
      r.classList.contains('adl-branch-graph__row--dimmed'),
    );
    const nonDimmedRows = [...rows].filter(
      (r) => !r.classList.contains('adl-branch-graph__row--dimmed'),
    );
    expect(nonDimmedRows.length).toBe(8);
    expect(dimmedRows.length).toBe(31 - 8);
    dimmedRows.forEach((el) => {
      expect((el as HTMLElement).style.opacity).toBe('0.25');
    });
    nonDimmedRows.forEach((el) => {
      expect((el as HTMLElement).style.opacity).toBe('1');
    });
    // Clicked label should have data-indicator (drag wrappers carry opacity)
    expect(labels[0].getAttribute('data-indicator')).toBe('true');
    const dragWrappers = container.querySelectorAll('.adl-branch-graph__label-drag');
    // Non-selected labels should have reduced opacity
    for (let i = 1; i < dragWrappers.length; i++) {
      expect((dragWrappers[i] as HTMLElement).style.opacity).toBe('0.4');
    }
    // Click active label again to clear filter
    fireEvent.click(labels[0]);

    await vi.waitFor(() => {
      const rowsAfterClear = container.querySelectorAll('.adl-branch-graph__row');
      const dimmedAfterClear = [...rowsAfterClear].filter((r) =>
        r.classList.contains('adl-branch-graph__row--dimmed'),
      );
      expect(dimmedAfterClear.length).toBe(0);
      rowsAfterClear.forEach((el) => {
        expect((el as HTMLElement).style.opacity).toBe('1');
      });
    });
    // All labels should clear data-indicator after un-selection
    for (const label of container.querySelectorAll('.adl-branch-graph__label')) {
      expect(label.getAttribute('data-indicator')).toBeNull();
    }
  });

  it('exposes owning branch via data-branch and renders additional refs as commit badges', () => {
    const dataWithExtraRefs: RawBranchGraph = {
      ...mockData,
      nodes: mockData.nodes.map((n) =>
        n.hash === 'e7f8a9' ? { ...n, refs: ['main', 'experiment/playground'] } : n,
      ),
    };
    const { container } = render(<BranchGraph data={dataWithExtraRefs} />);
    // Owner (main) and remote refs are excluded from badges; extra ref shows up
    const badges = container.querySelectorAll('.adl-branch-graph__commit-badge');
    expect(badges.length).toBeGreaterThan(0);
    expect([...badges].some((b) => b.textContent === 'experiment/playground')).toBe(true);
    // Every row carries the owning branch for e.g. test/dogfood hooks
    const rows = container.querySelectorAll('.adl-branch-graph__row');
    expect(rows.length).toBe(31);
    const rowBranches = new Set([...rows].map((r) => r.getAttribute('data-branch')));
    expect(rowBranches.has('main')).toBe(true);
    expect(rowBranches.has('feature-1')).toBe(true);
    expect(rowBranches.has('hotfix')).toBe(true);
  });

  it('shows mergeBase short hash in the branch label tooltip when provided', () => {
    const dataWithProgress = {
      ...mockData,
      branchProgress: { main: { ahead: 2, behind: 0, mergeBase: 'a2a3a4a5a6a7' } },
    };
    const { container } = render(<BranchGraph data={dataWithProgress} />);
    const mainLabel = container.querySelector('.adl-branch-graph__label-text');
    expect(mainLabel?.getAttribute('title')).toContain('a2a3a4');
  });

  it('shows a merged-into-main hint for fully merged branches, not for unmerged ones', () => {
    // 'archived' is a branch whose tip (a8) sits on main's first-parent spine —
    // fully merged. feature-1 is also merged (tip reachable via a14's octopus
    // merge). feature-2 is not merged.
    const mergedData: RawBranchGraph = {
      ...mockData,
      branches: [...allBranches, 'archived'],
      nodes: mockData.nodes.map((n) =>
        n.hash === 'a7a8a9' ? { ...n, refs: [...(n.refs ?? []), 'archived'] } : n,
      ),
    };
    const { container } = render(<BranchGraph data={mergedData} />);
    const labelTexts = [...container.querySelectorAll('.adl-branch-graph__label-text')];
    const archivedLabel = labelTexts.find((l) => l.textContent === 'archived')!;
    const feature1Label = labelTexts.find((l) => l.textContent === 'feature-1')!;
    const feature2Label = labelTexts.find((l) => l.textContent === 'feature-2')!;
    expect(archivedLabel.getAttribute('title')).toBe('archived — merged into main');
    expect(feature1Label.getAttribute('title')).toBe('feature-1 — merged into main');
    expect(feature2Label.getAttribute('title')).toBe('feature-2');
  });

  it('keeps the head node of a fully merged branch lit in its branch color when selected', async () => {
    const mergedData: RawBranchGraph = {
      ...mockData,
      branches: [...allBranches, 'archived'],
      nodes: mockData.nodes.map((n) =>
        n.hash === 'a7a8a9' ? { ...n, refs: [...(n.refs ?? []), 'archived'] } : n,
      ),
    };
    const { container } = render(<BranchGraph data={mergedData} />);
    const labels = [...container.querySelectorAll('.adl-branch-graph__label')];
    const archivedLabel = labels.find((l) => l.textContent === 'archived')!;
    expect(archivedLabel).toBeTruthy();

    fireEvent.click(archivedLabel);

    await vi.waitFor(() => {
      const rows = [...container.querySelectorAll('.adl-branch-graph__row')];
      // a8 is owned by main (it is on the mainline spine), yet the branch label
      // still points at it — the head anchor — so it must NOT be dimmed.
      const a8Row = rows.find((r) => r.textContent?.includes('a7a8a9'))!;
      expect(a8Row.classList.contains('adl-branch-graph__row--dimmed')).toBe(false);
      expect((a8Row as HTMLElement).style.opacity).toBe('1');
    });
    // The anchor SVG node uses the archived branch color (not the owner's).
    const archivedColor = (archivedLabel as HTMLElement).style.background;
    expect(archivedColor).toContain('var(--branch-color-');
    const anchorCircle = [...container.querySelectorAll('circle')].find(
      (c) => c.getAttribute('fill') === archivedColor,
    );
    expect(anchorCircle).toBeTruthy();
    // All other branches stay dimmed.
    const dimmed = [...container.querySelectorAll('.adl-branch-graph__row')].filter((r) =>
      r.classList.contains('adl-branch-graph__row--dimmed'),
    );
    expect(dimmed.length).toBeGreaterThan(0);
  });

  it('colors lane lines by branch ownership, matching the branch label colors', async () => {
    const { container } = render(<BranchGraph data={mockData} />);
    const labels = container.querySelectorAll('.adl-branch-graph__label');
    const branchColors = new Set(
      [...labels].map((label) => (label as HTMLElement).style.background),
    );

    // Default state: branch-owned lane segments use the owning branch's label
    // color rather than the raw lane-assignment palette color.
    const laneLines = [...container.querySelectorAll('line')].filter((l) =>
      l.getAttribute('stroke')?.startsWith('var(--branch-color-'),
    );
    expect(laneLines.length).toBeGreaterThan(0);
    laneLines.forEach((l) => {
      expect(branchColors).toContain(l.getAttribute('stroke'));
    });

    // Filter to a single branch: the dimmed (non-selected) lane segments must
    // keep the OTHER branch's label color at low opacity — not a palette color.
    fireEvent.click(labels[0]);
    await vi.waitFor(() => {
      const hasDimmedRow = [...container.querySelectorAll('.adl-branch-graph__row')].some((r) =>
        r.classList.contains('adl-branch-graph__row--dimmed'),
      );
      expect(hasDimmedRow).toBe(true);
    });
    const dimmedLaneLines = [...container.querySelectorAll('line')].filter((l) => {
      const stroke = l.getAttribute('stroke');
      return (
        stroke !== null &&
        stroke.startsWith('var(--branch-color-') &&
        l.getAttribute('opacity') === '0.1'
      );
    });
    expect(dimmedLaneLines.length).toBeGreaterThan(0);
    dimmedLaneLines.forEach((l) => {
      expect(branchColors).toContain(l.getAttribute('stroke'));
    });
  });

  it('uses the shared branch color map for labels and lane strokes', () => {
    const { container } = render(<BranchGraph data={mockData} />);
    const releaseLabel = [...container.querySelectorAll('.adl-branch-graph__label')].find(
      (label) => label.textContent === 'release/v1.0',
    ) as HTMLElement | undefined;
    expect(releaseLabel).toBeTruthy();

    const releaseColor = releaseLabel!.style.background;
    expect(releaseColor).toContain('var(--branch-color-');
    // The fixture's assigned slot differs from the per-name hash fallback, so
    // dropping the shared map would surface as a different lane color.
    expect(releaseColor).not.toBe(getRefLabelColor('release/v1.0'));

    const laneStrokes = [...container.querySelectorAll('.adl-branch-graph__svg line')].map((line) =>
      line.getAttribute('stroke'),
    );
    expect(laneStrokes).toContain(releaseColor);
  });

  it('preloads the persisted branch color map on first render', () => {
    window.localStorage.setItem(
      'adl-git-vis:branch-colors',
      JSON.stringify({ main: 5, 'feature-1': 7 }),
    );

    const { container } = render(<BranchGraph data={mockData} />);
    const mainLabel = [...container.querySelectorAll('.adl-branch-graph__label')].find(
      (label) => label.textContent === 'main',
    ) as HTMLElement | undefined;
    expect(mainLabel).toBeTruthy();
    expect(mainLabel!.style.background).toContain('--branch-color-06');
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
