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
    expect(paths[0]?.getAttribute('d')).toBe('M11 6L5 12L11 18');
    expect(paths[1]?.getAttribute('d')).toBe('M19 6L13 12L19 18');
  });

  it('IconChevronsRight renders the two right-pointing chevron paths', () => {
    const { container } = render(<IconChevronsRight size={12} strokeWidth={1.5} decorative />);
    const paths = container.querySelectorAll('path');
    expect(paths.length).toBe(2);
    expect(paths[0]?.getAttribute('d')).toBe('M13 6L19 12L13 18');
    expect(paths[1]?.getAttribute('d')).toBe('M5 6L11 12L5 18');
  });
});
