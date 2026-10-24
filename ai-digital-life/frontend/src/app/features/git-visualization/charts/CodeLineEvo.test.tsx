import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, renderHook, act } from '@testing-library/react';
import React from 'react';
import {
  CodeLineEvo,
  CodeLineEvoSeriesToggle,
  useCodeLineEvoVisibility,
  DEFAULT_VISIBILITY,
  CODE_LINE_EVO_VISIBLE_KEY,
} from './CodeLineEvo';

beforeEach(() => {
  localStorage.removeItem(CODE_LINE_EVO_VISIBLE_KEY);
});

function createMotionValue(initial = 0) {
  const listeners: Record<string, ((v: unknown) => void)[]> = {};
  return {
    get: () => initial,
    set: (v: unknown) => {
      listeners.change?.forEach((fn) => fn(v));
    },
    stop: () => {},
    on: (event: string, fn: (v: unknown) => void) => {
      (listeners[event] ??= []).push(fn);
      return () => {
        listeners[event] = listeners[event]?.filter((f) => f !== fn);
      };
    },
  };
}

vi.mock('motion/react', () => ({
  motion: new Proxy(
    {},
    {
      get: (_t: never, tag: string) =>
        function MotionTag({
          children,
          _initial,
          _animate,
          _exit,
          _transition,
          _variants,
          _whileHover,
          _whileTap,
          _style,
          ...rest
        }: Record<string, unknown>) {
          const elProps: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(rest)) {
            if (k !== 'className' && k !== 'children' && k !== 'key') {
              elProps[k] = v;
            }
          }
          return React.createElement(
            tag === 'default' ? 'div' : tag,
            { className: rest.className as string, key: rest.key as string, ...elProps },
            children as React.ReactNode,
          );
        },
    },
  ),
  animate: () => ({ stop: () => {}, then: () => Promise.resolve(), cancel: () => {} }),
  useMotionValue: <T,>(val: T) => createMotionValue(val as number),
  useTransform: () => createMotionValue(0),
  useSpring: (val: unknown) => createMotionValue(typeof val === 'number' ? val : 0),
  useReducedMotion: () => false,
}));

vi.mock('@visx/responsive', () => ({
  ParentSize: ({
    children,
  }: {
    children: (args: { width: number; height: number }) => React.ReactNode;
  }) => children({ width: 600, height: 72 }),
}));

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: vi.fn(() => ({
    t: {
      gitVisCodeLineEvoAdded: 'Lines added',
      gitVisCodeLineEvoDeleted: 'Lines deleted',
      gitVisCodeLineEvoAddedShort: 'Added',
      gitVisCodeLineEvoDeletedShort: 'Deleted',
      gitVisCodeLineEvoNet: 'Net change',
      gitVisCodeLineEvoToggleLabel: 'Toggle series visibility',
    },
    formatT: vi.fn(),
  })),
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
    seriesColors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'],
    heatmapColors: [],
  }),
}));

const DAILY_DATA = {
  days: [
    { date: '2024-01-01', additions: 10, deletions: 2 },
    { date: '2024-01-02', additions: 5, deletions: 1 },
    { date: '2024-01-03', additions: 20, deletions: 3 },
    { date: '2024-01-04', additions: 8, deletions: 4 },
  ],
};

describe('CodeLineEvo', () => {
  it('renders SVG without crashing', () => {
    const { container } = render(<CodeLineEvo visible={DEFAULT_VISIBILITY} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('brush strip keeps a positive plot area at the 72px strip height (regression: default margins made innerHeight negative)', () => {
    const { container } = render(<CodeLineEvo data={DAILY_DATA} visible={DEFAULT_VISIBILITY} />);
    const stripRects = container.querySelectorAll('.adl-chart-brush-layout__strip svg rect');
    expect(stripRects.length).toBeGreaterThan(0);
    for (const rect of stripRects) {
      const h = Number(rect.getAttribute('height'));
      expect(h).toBeGreaterThanOrEqual(0);
    }
  });

  it('renders diverging Area fills (zero baseline) and a highlighted zero grid row in the main chart', () => {
    const { container } = render(<CodeLineEvo data={DAILY_DATA} visible={DEFAULT_VISIBILITY} />);
    const mainChartSvg = container.querySelector('.adl-chart-brush-layout svg');
    expect(mainChartSvg).toBeInTheDocument();

    const filledPaths = Array.from(mainChartSvg!.querySelectorAll('path')).filter((p) => {
      const d = p.getAttribute('d');
      const fill = p.getAttribute('fill');
      return Boolean(d && d.length > 0 && fill && fill !== 'none');
    });
    expect(filledPaths.length).toBeGreaterThan(0);

    const highlightRows = mainChartSvg!.querySelectorAll('.chart-grid-highlight-rows line');
    expect(highlightRows.length).toBeGreaterThan(0);
  });

  it('does not render the series toggle inside the chart area (it moved to the card header)', () => {
    const { container } = render(<CodeLineEvo data={DAILY_DATA} visible={DEFAULT_VISIBILITY} />);
    expect(container.querySelector('.adl-git-vis__series-toggle')).toBeNull();
  });

  it('hides the added area from the main chart when visible.added is false', () => {
    const { container } = render(
      <CodeLineEvo data={DAILY_DATA} visible={{ added: false, deleted: true, net: true }} />,
    );
    const mainChartSvg = container.querySelector('.adl-chart-brush-layout svg');
    expect(
      mainChartSvg!.querySelectorAll('linearGradient[id^="area-gradient-added-"]').length,
    ).toBe(0);
    expect(
      mainChartSvg!.querySelectorAll('linearGradient[id^="area-gradient-deletedNeg-"]').length,
    ).toBe(1);
  });

  it('hides the deleted area from the main chart when visible.deleted is false', () => {
    const { container } = render(
      <CodeLineEvo data={DAILY_DATA} visible={{ added: true, deleted: false, net: true }} />,
    );
    const mainChartSvg = container.querySelector('.adl-chart-brush-layout svg');
    expect(
      mainChartSvg!.querySelectorAll('linearGradient[id^="area-gradient-deletedNeg-"]').length,
    ).toBe(0);
    expect(
      mainChartSvg!.querySelectorAll('linearGradient[id^="area-gradient-added-"]').length,
    ).toBe(1);
  });

  it('hides the net line from the main chart but keeps it in the overview strip when visible.net is false', () => {
    const { container } = render(
      <CodeLineEvo data={DAILY_DATA} visible={{ added: true, deleted: true, net: false }} />,
    );
    const mainChartSvg = container.querySelector('.adl-chart-brush-layout svg');
    const stripSvg = container.querySelector('.adl-chart-brush-layout__strip svg');
    expect(mainChartSvg!.querySelectorAll('linearGradient[id^="line-gradient-net-"]').length).toBe(
      0,
    );
    expect(stripSvg!.querySelectorAll('linearGradient[id^="line-gradient-net-"]').length).toBe(1);
  });

  it('shows one sweep skeleton line per visible series when loading', () => {
    const { getByText, container } = render(
      <CodeLineEvo status="loading" loadingLabel="Loading chart..." visible={DEFAULT_VISIBILITY} />,
    );
    expect(getByText('Loading chart...')).toBeInTheDocument();
    // All three series visible → three skeleton sweep silhouettes.
    expect(container.querySelectorAll('mask[id^="line-sweep-"]').length).toBe(3);
  });

  it('renders skeleton lines matching the visible series subset when loading', () => {
    const { container } = render(
      <CodeLineEvo
        status="loading"
        loadingLabel="Loading chart..."
        visible={{ added: true, deleted: false, net: false }}
      />,
    );
    // Only "added" is visible → a single skeleton line.
    expect(container.querySelectorAll('mask[id^="line-sweep-"]').length).toBe(1);
  });

  it('uses the chart foreground token (not var(--foreground)) for skeleton strokes', () => {
    const { container } = render(
      <CodeLineEvo status="loading" loadingLabel="Loading chart..." visible={DEFAULT_VISIBILITY} />,
    );
    const stroked = Array.from(
      container.querySelectorAll(
        'path[stroke*="chart-foreground"], path[stroke*="var(--foreground)"]',
      ),
    );
    const anyForeground = stroked.some((p) =>
      p.getAttribute('stroke')?.includes('var(--foreground)'),
    );
    expect(anyForeground).toBe(false);
  });

  it('renders area silhouettes for added/deleted and a line silhouette for net when loading', () => {
    const { container } = render(
      <CodeLineEvo status="loading" loadingLabel="Loading chart..." visible={DEFAULT_VISIBILITY} />,
    );
    // added + deleted are areas (each draws its own area gradient); net is a plain line.
    const areaGradients = container.querySelectorAll(
      'linearGradient[id^="line-sweep-"][id$="-area"]',
    );
    const masks = container.querySelectorAll('mask[id^="line-sweep-"]');
    expect(masks.length).toBe(3);
    expect(areaGradients.length).toBe(2);
  });

  it('renders the zero-line divider mid-plot (not pinned to the bottom) while loading', () => {
    const { container } = render(
      <CodeLineEvo status="loading" loadingLabel="Loading chart..." visible={DEFAULT_VISIBILITY} />,
    );
    const divider = container.querySelector('.chart-grid-highlight-rows line');
    expect(divider).toBeInTheDocument();
    const y = Number(divider!.getAttribute('y1'));
    expect(Number.isFinite(y)).toBe(true);
    // Symmetric positive/negative skeleton data makes y=0 sit at the vertical
    // center of the plot (innerHeight/2 in the margin-translated group).
    const height = container.querySelector('svg')?.getAttribute('height');
    const h = height ? Number(height) : 0;
    expect(h).toBeGreaterThan(0);
    const innerHeight = h - 20 - 40; // top/bottom margins
    expect(Math.abs(y - innerHeight / 2)).toBeLessThan(3);
  });
});

describe('useCodeLineEvoVisibility', () => {
  it('reads persisted visibility from localStorage on mount', () => {
    localStorage.setItem(
      CODE_LINE_EVO_VISIBLE_KEY,
      JSON.stringify({ added: false, deleted: true, net: true }),
    );
    const { result } = renderHook(() => useCodeLineEvoVisibility());
    expect(result.current.visible).toEqual({ added: false, deleted: true, net: true });
  });

  it('toggleSeries flips a key and persists the new state to localStorage', () => {
    const { result } = renderHook(() => useCodeLineEvoVisibility());
    act(() => {
      result.current.toggleSeries('added');
    });
    expect(result.current.visible).toEqual({ added: false, deleted: true, net: true });
    const saved = JSON.parse(localStorage.getItem(CODE_LINE_EVO_VISIBLE_KEY) ?? '{}');
    expect(saved).toEqual({ added: false, deleted: true, net: true });
  });
});

describe('CodeLineEvoSeriesToggle', () => {
  it('renders three buttons with short labels, all pressed when visible', () => {
    const { container } = render(
      <CodeLineEvoSeriesToggle visible={DEFAULT_VISIBILITY} onToggle={() => {}} />,
    );
    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>('.adl-git-vis__series-toggle-btn'),
    );
    expect(buttons.length).toBe(3);
    expect(buttons[0].textContent).toContain('Added');
    expect(buttons[0].textContent).not.toContain('Lines added');
    expect(buttons[1].textContent).toContain('Deleted');
    expect(buttons[1].textContent).not.toContain('Lines deleted');
    expect(buttons[2].textContent).toContain('Net change');
    for (const button of buttons) {
      expect(button.getAttribute('aria-pressed')).toBe('true');
    }
  });

  it('reflects the visible prop via aria-pressed', () => {
    const { container } = render(
      <CodeLineEvoSeriesToggle
        visible={{ added: false, deleted: true, net: true }}
        onToggle={() => {}}
      />,
    );
    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>('.adl-git-vis__series-toggle-btn'),
    );
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false');
  });

  it('calls onToggle with the series key on click', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <CodeLineEvoSeriesToggle visible={DEFAULT_VISIBILITY} onToggle={onToggle} />,
    );
    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>('.adl-git-vis__series-toggle-btn'),
    );
    fireEvent.click(buttons[2]);
    expect(onToggle).toHaveBeenCalledWith('net');
  });
});
