import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import {
  IconAddWorkspace,
  IconChevronLeft,
  IconChevronRight,
  IconChevronDown,
  IconChevronUp,
  IconChevronsLeft,
  IconChevronsRight,
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

describe('IconAddWorkspace geometry', () => {
  it('renders a horizontal and a vertical crosshair path (24x24 plus sign)', () => {
    const { container } = render(<IconAddWorkspace size={16} decorative />);
    const paths = container.querySelectorAll('path');
    expect(paths.length).toBe(2);
    expect(paths[0]?.getAttribute('d')).toBe('M6 12H18');
    expect(paths[1]?.getAttribute('d')).toBe('M12 18V6');
  });

  it('dims the horizontal path to 0.4 opacity', () => {
    const { container } = render(<IconAddWorkspace size={16} decorative />);
    const paths = container.querySelectorAll('path');
    expect(paths[0]?.getAttribute('opacity')).toBe('0.4');
    expect(paths[1]?.getAttribute('opacity')).toBeNull();
  });

  it('applies a 1.5 stroke width', () => {
    const { container } = render(<IconAddWorkspace size={16} decorative />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('stroke-width')).toBe('1.5');
  });
});
