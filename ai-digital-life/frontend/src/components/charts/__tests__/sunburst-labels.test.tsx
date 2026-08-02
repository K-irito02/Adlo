import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { SunburstChart } from '../sunburst-chart';
import { SunburstSegment } from '../sunburst-segment';
import { SunburstLabels } from '../sunburst-labels';
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
  useMotionValue: <T,>(val: T) => ({ get: () => val, set: () => {}, stop: () => {}, on: () => () => {} }),
  useTransform: () => ({ get: () => 0, set: () => {}, stop: () => {}, on: () => () => {} }),
  useReducedMotion: () => false,
}));

// jsdom lacks canvas measureText; mock it to return a predictable width
const mockCtx = {
  font: '',
  measureText: (text: string) => ({ width: text.length * 6 }),
};
vi.stubGlobal('measureCanvas', undefined);
vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCtx as unknown as CanvasRenderingContext2D);

const testData: SunburstNode = {
  name: 'root',
  children: [
    { name: 'src', children: [{ name: 'a.ts', value: 10 }] },
    { name: 'very-long-directory-name-here', children: [{ name: 'b.ts', value: 5 }] },
  ],
};

function renderLabels() {
  return render(
    <SunburstChart data={testData} size={200}>
      <SunburstSegment index={0} />
      <SunburstSegment index={1} />
      <SunburstSegment index={2} />
      <SunburstSegment index={3} />
      <SunburstLabels />
    </SunburstChart>,
  );
}

describe('SunburstLabels', () => {
  it('renders short names without truncation', () => {
    const { container } = renderLabels();
    const texts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent);
    expect(texts.some((t) => t === 'src')).toBe(true);
  });

  it('truncates long names with ellipsis when they exceed available width', () => {
    const { container } = renderLabels();
    const texts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent ?? '');
    const truncated = texts.find((t) => t.endsWith('…'));
    expect(truncated).toBeDefined();
  });
});
