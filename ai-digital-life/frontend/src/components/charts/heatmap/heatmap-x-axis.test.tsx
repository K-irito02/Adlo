import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import { HeatmapChart } from './heatmap-chart';
import { HeatmapXAxis } from './heatmap-x-axis';
import type { HeatmapColumn } from './heatmap-context';

const reactRequireCache = vi.hoisted(() => ({ mod: undefined as ReturnType<typeof require> }));
vi.mock('motion/react', () => ({
  motion: new Proxy(
    {},
    {
      get: (_t: never, tag: string) =>
        function MotionTag({ children, ...rest }: Record<string, unknown>) {
          const React = (reactRequireCache.mod ??= require('react'));
          return React.createElement(
            tag === 'default' ? 'div' : tag,
            { className: rest.className, key: rest.key },
            children,
          );
        },
    },
  ),
  animate: () => ({ stop: () => {}, then: () => Promise.resolve(), cancel: () => {} }),
  useMotionValue: <T,>(v: T) => ({
    get: () => v,
    set: () => {},
    stop: () => {},
    on: () => () => {},
  }),
  useTransform: () => ({ get: () => 0, set: () => {}, stop: () => {} }),
  useSpring: (v: unknown) => ({
    get: () => (typeof v === 'number' ? v : 0),
    set: () => {},
    stop: () => {},
  }),
  useReducedMotion: () => true,
}));

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({ t: {} as Record<string, string>, locale: 'en-US', formatT: vi.fn() }),
}));

vi.mock('@visx/responsive', () => ({
  ParentSize: ({
    children,
  }: {
    children: (args: { width: number; height: number }) => React.ReactNode;
  }) => children({ width: 600, height: 200 }),
}));

function createMockData(columns: number, rows: number): HeatmapColumn[] {
  const data: HeatmapColumn[] = [];
  for (let c = 0; c < columns; c++) {
    const bins = [];
    for (let r = 0; r < rows; r++) {
      bins.push({ count: (c + r) % 10, bin: r });
    }
    data.push({ bin: c, bins, columnLabel: `W${c}` });
  }
  return data;
}

describe('HeatmapXAxis tooltip hit area', () => {
  it('keeps the outer label container pointer-events-none without a native title', () => {
    const data = createMockData(3, 2);
    const { container } = render(
      <HeatmapChart
        data={data}
        animationDuration={0}
        binSize={36}
        margin={{ top: 40, right: 16, bottom: 0, left: 80 }}
      >
        <HeatmapXAxis
          rotateAngle={45}
          top={20}
          onColumnClick={vi.fn()}
          onColumnContextMenu={vi.fn()}
          columnMeta={[{ isDir: true }, { isDir: false }, { isDir: false }]}
        />
      </HeatmapChart>,
    );

    const outerDivs = Array.from(
      container.querySelectorAll('[data-testid="heatmap-x-axis-label"]'),
    ) as HTMLElement[];
    expect(outerDivs.length).toBe(3);
    for (const el of outerDivs) {
      expect(el.className).toContain('pointer-events-none');
      expect(el.hasAttribute('title')).toBe(false);
    }
  });

  it('places the interactive cursor and click handlers on the inner rotated element', () => {
    const data = createMockData(3, 2);
    const onColumnClick = vi.fn();
    const { container } = render(
      <HeatmapChart
        data={data}
        animationDuration={0}
        binSize={36}
        margin={{ top: 40, right: 16, bottom: 0, left: 80 }}
      >
        <HeatmapXAxis
          rotateAngle={45}
          top={20}
          onColumnClick={onColumnClick}
          onColumnContextMenu={vi.fn()}
          columnMeta={[{ isDir: true }, { isDir: false }, { isDir: false }]}
        />
      </HeatmapChart>,
    );

    const outerDivs = Array.from(
      container.querySelectorAll('[data-testid="heatmap-x-axis-label"]'),
    ) as HTMLElement[];
    const titled = Array.from(container.querySelectorAll('[title]')) as HTMLElement[];

    expect(titled.length).toBe(1);
    const interactive = titled[0];
    expect(interactive.getAttribute('title')).toBe('W0');
    expect(interactive.textContent).toContain('W0');
    expect(interactive.style.transform).toContain('rotate');
    expect(interactive.className).toContain('pointer-events-auto');
    expect(interactive.className).toContain('cursor-pointer');

    // The interactive element is a direct child of the outer pointer-events-none container.
    const parent = interactive.parentElement as HTMLElement;
    expect(parent.dataset.testid).toBe('heatmap-x-axis-label');
    expect(parent.className).toContain('pointer-events-none');
    expect(parent.className).not.toContain('pointer-events-auto');

    // File labels must not be interactive anywhere.
    const interactiveOuterDivs = outerDivs.filter((el) => el.querySelector('.cursor-pointer'));
    expect(interactiveOuterDivs.length).toBe(1);
    expect(interactiveOuterDivs[0]).toBe(outerDivs[0]);
    for (const el of outerDivs) {
      expect(el.hasAttribute('title')).toBe(false);
    }

    fireEvent.click(interactive);
    expect(onColumnClick).toHaveBeenCalledWith('W0');

    // Clicking the outer label container must not trigger the column click.
    fireEvent.click(outerDivs[0]);
    expect(onColumnClick).toHaveBeenCalledTimes(1);
  });

  it('places the interactive handlers on the inner non-rotated element', () => {
    const data = createMockData(3, 2);
    const onColumnClick = vi.fn();
    const { container } = render(
      <HeatmapChart
        data={data}
        animationDuration={0}
        binSize={36}
        margin={{ top: 40, right: 16, bottom: 0, left: 80 }}
      >
        <HeatmapXAxis
          top={20}
          onColumnClick={onColumnClick}
          onColumnContextMenu={vi.fn()}
          columnMeta={[{ isDir: true }, { isDir: false }, { isDir: false }]}
        />
      </HeatmapChart>,
    );

    const outerDivs = Array.from(
      container.querySelectorAll('[data-testid="heatmap-x-axis-label"]'),
    ) as HTMLElement[];
    const titled = Array.from(container.querySelectorAll('[title]')) as HTMLElement[];

    expect(titled.length).toBe(1);
    const interactive = titled[0];
    expect(interactive.getAttribute('title')).toBe('W0');
    expect(interactive.textContent).toContain('W0');
    expect(interactive.style.transform).toBe('');
    expect(interactive.className).toContain('pointer-events-auto');
    expect(interactive.className).toContain('cursor-pointer');

    const interactiveOuterDivs = outerDivs.filter((el) => el.querySelector('.cursor-pointer'));
    expect(interactiveOuterDivs.length).toBe(1);
    expect(interactiveOuterDivs[0]).toBe(outerDivs[0]);

    fireEvent.click(interactive);
    expect(onColumnClick).toHaveBeenCalledWith('W0');
  });

  it('only invokes the context menu callback on interactive directory labels', () => {
    const data = createMockData(3, 2);
    const onColumnContextMenu = vi.fn();
    const { container } = render(
      <HeatmapChart
        data={data}
        animationDuration={0}
        binSize={36}
        margin={{ top: 40, right: 16, bottom: 0, left: 80 }}
      >
        <HeatmapXAxis
          rotateAngle={45}
          top={20}
          onColumnClick={vi.fn()}
          onColumnContextMenu={onColumnContextMenu}
          columnMeta={[{ isDir: true }, { isDir: false }, { isDir: false }]}
        />
      </HeatmapChart>,
    );

    const outerDivs = Array.from(
      container.querySelectorAll('[data-testid="heatmap-x-axis-label"]'),
    ) as HTMLElement[];
    const interactive = outerDivs[0].querySelector('[title]') as HTMLElement;

    const preventDefault = vi.fn();
    fireEvent.contextMenu(interactive, {
      clientX: 10,
      clientY: 20,
      preventDefault,
    });
    expect(onColumnContextMenu).toHaveBeenCalledWith('W0', 10, 20);

    // File labels must not trigger the context menu.
    const fileInteractive = outerDivs[1].querySelector(
      '[title], .cursor-pointer',
    ) as HTMLElement | null;
    expect(fileInteractive).toBeNull();
  });
});
