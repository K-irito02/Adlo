import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FileHotspotsView } from '../FileHotspotsView';
import { fileHotspotsMockData } from '@/test-fixtures/gitVisMockData';

vi.mock('motion/react', () => {
  const React = require('react');
  const motion = new Proxy(
    {},
    {
      get: (_t: never, tag: string) =>
        function MotionTag({
          children,
          ...rest
        }: React.PropsWithChildren<Record<string, unknown>>) {
          const elProps: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(rest)) {
            if (
              k === 'initial' ||
              k === 'animate' ||
              k === 'exit' ||
              k === 'transition' ||
              k === 'variants' ||
              k === 'whileHover' ||
              k === 'whileTap'
            ) {
              continue;
            }
            elProps[k] = v;
          }
          return React.createElement(tag, elProps, children);
        },
    },
  );
  const createMotionValue = (initial: unknown = 0) => {
    let value = initial;
    return {
      get: () => value,
      set: (v: unknown) => {
        value = v;
      },
      on: () => () => {},
      stop: () => {},
    };
  };
  return {
    motion,
    AnimatePresence: ({ children }: React.PropsWithChildren) =>
      React.createElement(React.Fragment, null, children),
    animate: () => ({
      stop: () => {},
      then: (cb?: () => void) => {
        cb?.();
        return Promise.resolve();
      },
      cancel: () => {},
    }),
    useMotionValue: (v: unknown) => createMotionValue(v),
    useTransform: () => createMotionValue(0),
    useSpring: (v: unknown) => createMotionValue(typeof v === 'number' ? v : 0),
    useReducedMotion: () => true,
  };
});

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: {
      gitVisHotspotsRankingFile: 'File',
      gitVisHotspotsRankingChangeCount: 'Changes',
      gitVisHotspotsRankingAdditions: 'Added',
      gitVisHotspotsRankingDeletions: 'Deleted',
      gitVisHotspotsRankingNet: 'Net',
      gitVisHotspotsRankingEmpty: 'No changed files',
      gitVisHotspotsFilterClear: 'Clear',
      gitVisSunburstHintZoomIn: 'Click to drill',
      gitVisSunburstHintZoomOut: 'Click center to zoom out',
      gitVisHotspotsTooltipChanges: '{count} changes',
      gitVisHotspotsTooltipLines: '+{add} / -{del} lines',
      gitVisHotspotsTooltipLastModified: 'Last modified {date}',
    },
  }),
}));

describe('FileHotspotsView', () => {
  it('renders both sunburst and ranking', () => {
    const { container } = render(<FileHotspotsView data={fileHotspotsMockData} />);
    // Sunburst renders an SVG
    expect(container.querySelector('svg')).toBeTruthy();
    // Ranking renders file paths
    expect(screen.getByText('src/api/handler.ts')).toBeTruthy();
  });

  it('renders empty state when data is undefined', () => {
    const { container } = render(<FileHotspotsView />);
    // No SVG when no data
    expect(container.querySelector('svg')).toBeFalsy();
  });
});
