import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { FileSunburst } from './FileSunburst';
import { fileTreemapData } from '../../../../test-fixtures/gitVisMockData';
import { TCopyProvider } from '@app/i18n/TCopyContext';

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
  useReducedMotion: () => false,
}));

describe('FileSunburst', () => {
  it('renders SVG with arcs', () => {
    const mockT = {};
    const { container } = render(
      <TCopyProvider t={mockT as any} locale="en-US">
        <FileSunburst data={fileTreemapData} />
      </TCopyProvider>,
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.querySelectorAll('path').length).toBeGreaterThan(0);
  });
});
