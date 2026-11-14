import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import {
  IconChevronLeft,
  IconChevronRight,
  IconChevronDown,
  IconChevronUp,
  IconChevronsLeft,
  IconChevronsRight,
  IconExpandCorners,
  IconPanelsCollapse,
  IconPanelsExpand,
  IconArrowUpLeft,
  IconArrowDownRight,
} from './core';

describe('chevron icon family geometry', () => {
  it('IconChevronLeft renders the left-pointing chevron path', () => {
    const { container } = render(<IconChevronLeft size={12} strokeWidth={1.5} decorative />);
    const path = container.querySelector('path');
    expect(path?.getAttribute('d')).toBe('M14 7L9 12L14 17');
  });

  it('IconChevronRight renders the right-pointing chevron path', () => {
    const { container } = render(<IconChevronRight size={12} strokeWidth={1.5} decorative />);
    const path = container.querySelector('path');
    expect(path?.getAttribute('d')).toBe('M10 17L15 12L10 7');
  });

  it('icons apply a 1.5 stroke width', () => {
    const { container } = render(<IconChevronLeft size={12} strokeWidth={1.5} decorative />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('stroke-width')).toBe('1.5');
  });

  it('IconChevronDown renders the down-pointing chevron path', () => {
    const { container } = render(<IconChevronDown size={12} strokeWidth={1.5} decorative />);
    const path = container.querySelector('path');
    expect(path?.getAttribute('d')).toBe('M7 10L12 15L17 10');
  });

  it('IconChevronUp renders the up-pointing chevron path', () => {
    const { container } = render(<IconChevronUp size={12} strokeWidth={1.5} decorative />);
    const path = container.querySelector('path');
    expect(path?.getAttribute('d')).toBe('M17 14L12 9L7 14');
  });

  it('IconChevronsLeft renders the two left-pointing chevron paths', () => {
    const { container } = render(<IconChevronsLeft size={12} strokeWidth={1.5} decorative />);
    const paths = container.querySelectorAll('path');
    expect(paths.length).toBe(2);
    expect(paths[0]?.getAttribute('d')).toBe('M10 17L5 12L10 7');
    expect(paths[1]?.getAttribute('d')).toBe('M18 17L13 12L18 7');
  });

  it('IconChevronsRight renders the two right-pointing chevron paths', () => {
    const { container } = render(<IconChevronsRight size={12} strokeWidth={1.5} decorative />);
    const paths = container.querySelectorAll('path');
    expect(paths.length).toBe(2);
    expect(paths[0]?.getAttribute('d')).toBe('M14 17L19 12L14 7');
    expect(paths[1]?.getAttribute('d')).toBe('M6 17L11 12L6 7');
  });
});

describe('IconPanelsCollapse / IconPanelsExpand geometry', () => {
  it('points both arrows outward when collapsing', () => {
    const { container } = render(<IconPanelsCollapse size={16} decorative />);
    const paths = container.querySelectorAll('path');
    expect(paths.length).toBe(4);
    expect(paths[0]?.getAttribute('d')).toBe('M4 4v16');
    expect(paths[1]?.getAttribute('d')).toBe('M20 4v16');
    expect(paths[2]?.getAttribute('d')).toBe('m9.5 9-3 3 3 3');
    expect(paths[3]?.getAttribute('d')).toBe('m14.5 9 3 3-3 3');
  });

  it('mirrors both arrows inward when expanding', () => {
    const { container } = render(<IconPanelsExpand size={16} decorative />);
    const paths = container.querySelectorAll('path');
    expect(paths.length).toBe(4);
    expect(paths[2]?.getAttribute('d')).toBe('m7 9 3 3-3 3');
    expect(paths[3]?.getAttribute('d')).toBe('m17 9-3 3 3 3');
  });
});

describe('center action arrows', () => {
  it('IconArrowUpLeft is the show-in-center glyph', () => {
    const { container } = render(<IconArrowUpLeft size={14} decorative />);
    const paths = [...container.querySelectorAll('path')].map((p) => p.getAttribute('d'));
    expect(paths).toEqual(['M17 17 7 7', 'M17 7H7v10']);
  });

  it('IconArrowDownRight is the 右侧面板 return glyph', () => {
    const { container } = render(<IconArrowDownRight size={14} decorative />);
    const paths = [...container.querySelectorAll('path')].map((p) => p.getAttribute('d'));
    expect(paths).toEqual(['M7 7 17 17', 'M7 17h10V7']);
  });
});

describe('IconExpandCorners', () => {
  it('keeps the source viewBox and the four corner paths', () => {
    const { container } = render(<IconExpandCorners size={12} decorative />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 25 24');
    expect(container.querySelectorAll('path').length).toBe(4);
  });

  it('inherits currentColor instead of a hard-coded fill', () => {
    const { container } = render(<IconExpandCorners size={12} decorative />);
    expect(container.querySelector('svg')?.getAttribute('fill')).toBe('currentColor');
    for (const path of container.querySelectorAll('path')) {
      expect(path.getAttribute('fill')).toBeNull();
    }
  });
});
