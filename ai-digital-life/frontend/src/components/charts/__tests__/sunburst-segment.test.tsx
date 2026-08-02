import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { SunburstChart } from '../sunburst-chart';
import { SunburstSegment } from '../sunburst-segment';
import type { SunburstNode } from '../sunburst-chart';

vi.mock('motion/react', () => ({
  motion: new Proxy(
    {},
    {
      get: (_t: never, tag: string) =>
        function MotionTag({ children, ...rest }: Record<string, unknown>) {
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
  useMotionValue: <T,>(val: T) => ({
    get: () => val,
    set: () => {},
    stop: () => {},
    on: () => () => {},
  }),
  useTransform: () => ({ get: () => 0, set: () => {}, stop: () => {}, on: () => () => {} }),
  useReducedMotion: () => false,
}));

const testData: SunburstNode = {
  name: 'root',
  children: [
    { name: 'src', children: [{ name: 'main.js', value: 10 }] },
    { name: 'docs', children: [{ name: 'README.md', value: 5 }] },
  ],
};

const mockData: SunburstNode = {
  name: 'root',
  children: [
    { name: 'child1', value: 10 },
    { name: 'child2', value: 5 },
  ],
};

describe('SunburstSegment', () => {
  it('renders a <title> element with the arc name for native tooltip', () => {
    const { container } = render(
      <SunburstChart data={testData} size={200}>
        <SunburstSegment index={0} />
        <SunburstSegment index={1} />
      </SunburstChart>,
    );
    const titles = container.querySelectorAll('g title');
    expect(titles.length).toBeGreaterThan(0);
  });

  it('renders custom tooltipText when provided', () => {
    const tooltipText = 'src/core/\n变更: 24 次\n+120 / -45 行\n最近: 2026-07-31';
    const { container } = render(
      <SunburstChart data={mockData} size={200}>
        <SunburstSegment index={0} tooltipText={tooltipText} />
      </SunburstChart>,
    );
    const title = container.querySelector('title');
    expect(title?.textContent).toBe(tooltipText);
  });

  it('falls back to arc name when tooltipText is not provided', () => {
    const { container } = render(
      <SunburstChart data={mockData} size={200}>
        <SunburstSegment index={0} />
      </SunburstChart>,
    );
    const title = container.querySelector('title');
    expect(title?.textContent).toBe('child1');
  });
});
