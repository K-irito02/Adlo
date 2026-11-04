import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ContributorModuleHeatmap } from './ContributorModuleHeatmap';
import { TCopyProvider } from '@app/i18n/TCopyContext';

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: {
      gitVisContribution: 'contribution',
      gitVisContributions: 'contributions',
      gitVisModuleFrontend: 'Frontend',
      gitVisModuleBackend: 'Backend',
      gitVisModuleDatabase: 'Database',
      gitVisModuleTesting: 'Testing',
      gitVisModuleDocs: 'Documentation',
    },
    locale: 'en-US',
    formatT: vi.fn(),
  }),
}));

vi.mock('../ModuleBreadcrumb', () => ({
  ModuleBreadcrumb: ({ pathSegments }: { pathSegments: string[] }) =>
    React.createElement(
      'div',
      { 'data-testid': 'breadcrumb' },
      pathSegments.length === 0 ? 'Root' : pathSegments.join('/'),
    ),
}));

vi.mock('../ModuleTreeCard', () => ({
  ModuleTreeCard: () => null,
}));

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

vi.mock('@visx/responsive', () => ({
  ParentSize: ({
    children,
  }: {
    children: (args: { width: number; height: number }) => React.ReactNode;
  }) => children({ width: 600, height: 200 }),
}));

vi.mock('motion/react', () => {
  const createMV = (v = 0) => ({ get: () => v, set: () => {}, stop: () => {}, on: () => () => {} });
  return {
    motion: new Proxy(
      {},
      {
        get: () => (p: Record<string, unknown>) => {
          const { children, ...rest } = p;
          return React.createElement(
            'div',
            { className: rest.className as string, key: rest.key as string },
            children as React.ReactNode,
          );
        },
      },
    ),
    animate: () => ({ stop: () => {}, then: () => Promise.resolve(), cancel: () => {} }),
    useMotionValue: <T,>(v: T) => createMV(v as number),
    useTransform: () => createMV(0),
    useSpring: (v: unknown) => createMV(typeof v === 'number' ? v : 0),
    useReducedMotion: () => false,
  };
});

const mockData = [
  {
    author: 'Alice',
    authorEmail: 'alice@test.com',
    modules: [
      { module: 'src/components/bar.tsx', count: 3 },
      { module: 'src/components/foo.tsx', count: 2 },
      { module: 'src/utils/helpers.ts', count: 1 },
    ],
  },
  {
    author: 'Bob',
    authorEmail: 'bob@test.com',
    modules: [
      { module: 'src/components/bar.tsx', count: 1 },
      { module: 'docs/readme.md', count: 4 },
    ],
  },
];

const mockAllPaths = [
  'src/components/bar.tsx',
  'src/components/foo.tsx',
  'src/utils/helpers.ts',
  'docs/readme.md',
];

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <TCopyProvider t={{} as any} locale="en-US">
      {children}
    </TCopyProvider>
  );
}

describe('ContributorModuleHeatmap', () => {
  it('should render breadcrumb at root', () => {
    render(
      <Wrapper>
        <ContributorModuleHeatmap data={mockData} allPaths={mockAllPaths} />
      </Wrapper>,
    );
    expect(screen.getByText('Root')).toBeInTheDocument();
  });

  it('should render heatmap SVG', () => {
    const { container } = render(
      <Wrapper>
        <ContributorModuleHeatmap data={mockData} allPaths={mockAllPaths} />
      </Wrapper>,
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('should show loading label when status is loading', () => {
    render(
      <Wrapper>
        <ContributorModuleHeatmap
          data={mockData}
          allPaths={mockAllPaths}
          status="loading"
          loadingLabel="Loading..."
        />
      </Wrapper>,
    );
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders columns for the controlled drill path', () => {
    const { container } = render(
      <Wrapper>
        <ContributorModuleHeatmap
          data={mockData}
          allPaths={mockAllPaths}
          drillPath={['src']}
          onDrillPathChange={vi.fn()}
        />
      </Wrapper>,
    );
    const labels = Array.from(
      container.querySelectorAll('[data-testid="heatmap-x-axis-label"]'),
    ).map((el) => (el.textContent ?? '').trim());
    // drillPath=['src'] shows src's children only (components, utils) — not the
    // whole cumulative path list.
    expect(labels).toEqual(['components', 'utils']);
  });

  it('reports drill path changes to the parent when controlled', () => {
    const onDrillPathChange = vi.fn();
    render(
      <Wrapper>
        <ContributorModuleHeatmap
          data={mockData}
          allPaths={mockAllPaths}
          drillPath={['src']}
          onDrillPathChange={onDrillPathChange}
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByText('components'));
    expect(onDrillPathChange).toHaveBeenCalledWith(['src', 'components']);
  });

  it('resets a stale drill path when the data no longer contains it', () => {
    const onDrillPathChange = vi.fn();
    const { rerender } = render(
      <Wrapper>
        <ContributorModuleHeatmap
          data={mockData}
          allPaths={mockAllPaths}
          drillPath={['src']}
          onDrillPathChange={onDrillPathChange}
        />
      </Wrapper>,
    );
    // 'src' is still present in the initial data → no reset.
    expect(onDrillPathChange).not.toHaveBeenCalled();
    // Re-render with data that no longer contains the 'src' directory: the
    // stale path must fall back to root instead of leaving an empty heatmap.
    rerender(
      <Wrapper>
        <ContributorModuleHeatmap
          data={mockData}
          allPaths={['docs/readme.md']}
          drillPath={['src']}
          onDrillPathChange={onDrillPathChange}
        />
      </Wrapper>,
    );
    expect(onDrillPathChange).toHaveBeenCalledWith([]);
  });
});
