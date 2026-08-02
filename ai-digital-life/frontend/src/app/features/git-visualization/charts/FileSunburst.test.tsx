import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
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

const mockCtx = {
  font: '',
  measureText: (text: string) => ({ width: text.length * 6 }),
};

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
}));

vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
  mockCtx as unknown as CanvasRenderingContext2D,
);

const mockT = {
  gitVisModuleRoot: '根目录',
  gitVisBreadcrumbNav: '模块路径导航',
  gitVisSunburstHintZoomIn: '点击扇形可下钻',
  gitVisSunburstHintZoomOut: '点击中心可缩放',
} as any;

function renderSunburst() {
  return render(
    <TCopyProvider t={mockT} locale="zh-CN">
      <FileSunburst data={{ tree: fileTreemapData }} />
    </TCopyProvider>,
  );
}

describe('FileSunburst', () => {
  it('renders SVG with arcs', () => {
    const { container } = renderSunburst();
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.querySelectorAll('path').length).toBeGreaterThan(0);
  });

  it('shows root-view hint text "点击扇形可下钻" when not drilled', () => {
    const { container } = renderSunburst();
    const hint = container.querySelector('.adl-file-sunburst-hint');
    expect(hint?.textContent).toBe('点击扇形可下钻');
  });

  it('does not render breadcrumb in root view', () => {
    const { container } = renderSunburst();
    expect(container.querySelector('.adl-module-breadcrumb')).toBeNull();
  });

  it('renders breadcrumb and zoom-out hint after drilling into a segment', () => {
    const { container } = renderSunburst();
    // Click the first clickable segment (a directory with children).
    // Segments are sorted depth-descending, so leaf segments come first in DOM.
    // Directory segments set cursor:pointer on their <g> wrapper; leaves use cursor:default.
    const clickablePaths = Array.from(container.querySelectorAll('path')).filter((p) => {
      if (p.getAttribute('fill') !== 'transparent') {
        return false;
      }
      const parent = p.parentElement;
      if (!parent) {
        return false;
      }
      const styleAttr = parent.getAttribute('style') || '';
      return /cursor:\s*pointer/.test(styleAttr);
    });
    expect(clickablePaths.length).toBeGreaterThan(0);
    fireEvent.click(clickablePaths[0]);

    const breadcrumb = container.querySelector('.adl-module-breadcrumb');
    expect(breadcrumb).not.toBeNull();
    expect(breadcrumb?.textContent).toContain('根目录');

    const hint = container.querySelector('.adl-file-sunburst-hint');
    expect(hint?.textContent).toBe('点击中心可缩放');
  });
});
