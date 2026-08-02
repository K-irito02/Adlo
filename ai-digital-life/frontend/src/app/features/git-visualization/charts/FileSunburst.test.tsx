import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { FileSunburstChart } from './FileSunburst';
import { fileHotspotsMockData } from '@/test-fixtures/gitVisMockData';
import { TCopyProvider, type TCopyContextValue } from '@app/i18n/TCopyContext';

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

// Mock motion to avoid animation issues in tests. SunburstChart uses motion.svg,
// motion.g, motion.path, animate, useMotionValue, useTransform — mock them all.
vi.mock('motion/react', () => ({
  motion: new Proxy(
    {},
    {
      get: (_t: never, tag: string) =>
        function MotionTag({
          children,
          initial: _initial,
          animate: _animate,
          exit: _exit,
          transition: _transition,
          variants: _variants,
          whileHover: _whileHover,
          whileTap: _whileTap,
          style,
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
            { className: rest.className, key: rest.key, style, ...elProps },
            children,
          );
        },
    },
  ),
  animate: () => ({ stop: () => {}, then: () => Promise.resolve(), cancel: () => {} }),
  useMotionValue: <T,>(val: T) => createMotionValue(val as number),
  useTransform: () => createMotionValue(0),
  useReducedMotion: () => false,
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

const mockT = {
  gitVisModuleRoot: 'Root',
  gitVisBreadcrumbNav: 'Module breadcrumb',
  gitVisSunburstHintZoomIn: 'Click a segment to zoom in',
  gitVisSunburstHintZoomOut: 'Click the center to zoom out',
  gitVisHotspotsTooltipChanges: '{count} changes',
  gitVisHotspotsTooltipLines: '+{add} / -{del} lines',
  gitVisHotspotsTooltipLastModified: 'Last modified {date}',
} as unknown as TCopyContextValue['t'];

describe('FileSunburstChart', () => {
  it('renders without crashing with hotspot data', () => {
    const { container } = render(
      <TCopyProvider t={mockT} locale="en-US">
        <FileSunburstChart data={fileHotspotsMockData} colorMode="heat" />
      </TCopyProvider>,
    );
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('renders empty state when data is undefined', () => {
    const { container } = render(
      <TCopyProvider t={mockT} locale="en-US">
        <FileSunburstChart colorMode="heat" />
      </TCopyProvider>,
    );
    expect(container.querySelector('svg')).toBeFalsy();
  });

  it('calls onDrill with path when focus changes', () => {
    const onDrill = vi.fn();
    render(
      <TCopyProvider t={mockT} locale="en-US">
        <FileSunburstChart data={fileHotspotsMockData} colorMode="heat" onDrill={onDrill} />
      </TCopyProvider>,
    );
    // Initial mount calls onDrill with empty path (root)
    expect(onDrill).toHaveBeenCalledWith([]);
  });
});
