import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import { CodeLineEvo } from './CodeLineEvo';

beforeEach(() => {
  localStorage.removeItem('gitVisCodeLineEvoVisible');
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
          const React = require('react');
          const elProps: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(rest)) {
            if (k !== 'className' && k !== 'children' && k !== 'key') {
              elProps[k] = v;
            }
          }
          return React.createElement(
            tag === 'default' ? 'div' : tag,
            { className: rest.className, key: rest.key, ...elProps },
            children,
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
    const { container } = render(<CodeLineEvo />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('brush strip keeps a positive plot area at the 72px strip height (regression: default margins made innerHeight negative)', () => {
    const { container } = render(<CodeLineEvo data={DAILY_DATA} />);
    const stripRects = container.querySelectorAll('.adl-chart-brush-layout__strip svg rect');
    expect(stripRects.length).toBeGreaterThan(0);
    for (const rect of stripRects) {
      const h = Number(rect.getAttribute('height'));
      expect(h).toBeGreaterThanOrEqual(0);
    }
  });

  it('renders diverging Area fills (zero baseline) and a highlighted zero grid row in the main chart', () => {
    const { container } = render(<CodeLineEvo data={DAILY_DATA} />);
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

  it('renders three series toggle buttons, all active by default', () => {
    const { container } = render(<CodeLineEvo data={DAILY_DATA} />);
    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>('.adl-git-vis__series-toggle-btn'),
    );
    expect(buttons.length).toBe(3);
    for (const button of buttons) {
      expect(button.getAttribute('aria-pressed')).toBe('true');
    }
  });

  it('hiding the net series removes it from the main chart but keeps the overview strip', () => {
    const { container } = render(<CodeLineEvo data={DAILY_DATA} />);
    const mainChartSvg = container.querySelector('.adl-chart-brush-layout svg');
    const stripSvg = container.querySelector('.adl-chart-brush-layout__strip svg');
    const mainNetGradient = () =>
      mainChartSvg!.querySelectorAll('linearGradient[id^="line-gradient-net-"]');
    const stripNetGradient = () =>
      stripSvg!.querySelectorAll('linearGradient[id^="line-gradient-net-"]');
    expect(mainNetGradient().length).toBe(1);
    expect(stripNetGradient().length).toBe(1);

    const netButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>('.adl-git-vis__series-toggle-btn'),
    ).find((b) => b.textContent?.includes('Net change'));
    expect(netButton).toBeDefined();
    fireEvent.click(netButton!);

    expect(netButton!.getAttribute('aria-pressed')).toBe('false');
    expect(mainNetGradient().length).toBe(0);
    expect(stripNetGradient().length).toBe(1);
  });

  it('persists toggle state and reads it back on mount', () => {
    localStorage.setItem(
      'gitVisCodeLineEvoVisible',
      JSON.stringify({ added: false, deleted: true, net: true }),
    );
    const { container } = render(<CodeLineEvo data={DAILY_DATA} />);
    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>('.adl-git-vis__series-toggle-btn'),
    );
    expect(
      buttons.find((b) => b.textContent?.includes('Lines added'))?.getAttribute('aria-pressed'),
    ).toBe('false');
    expect(
      buttons.find((b) => b.textContent?.includes('Lines deleted'))?.getAttribute('aria-pressed'),
    ).toBe('true');

    const deletedButton = buttons.find((b) => b.textContent?.includes('Lines deleted'));
    fireEvent.click(deletedButton!);
    const saved = JSON.parse(localStorage.getItem('gitVisCodeLineEvoVisible') ?? '{}');
    expect(saved.deleted).toBe(false);
  });
});
