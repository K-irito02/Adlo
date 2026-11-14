import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { IconBookmarkStar, IconBookmarkStarFilled } from './actions';

describe('bookmark star icons', () => {
  it('outline star keeps the two-contour outline path', () => {
    const { container } = render(<IconBookmarkStar size={14} decorative />);
    const path = container.querySelector('path');
    const d = path?.getAttribute('d') ?? '';
    expect(d.match(/[Mm]/g)?.length).toBe(2);
  });

  it('filled star is a single solid silhouette (no evenodd hole)', () => {
    // 2026-11-15 回归：旧实现直接填充空心星路径（内外两条轮廓 + evenodd），
    // 填充后仍是空心，已收藏时星标视觉上不变实心。实心版本必须只有一个子路径。
    const { container } = render(<IconBookmarkStarFilled size={14} decorative />);
    const svg = container.querySelector('svg');
    const path = container.querySelector('path');
    const d = path?.getAttribute('d') ?? '';
    expect(d.match(/[Mm]/g)?.length).toBe(1);
    expect(path?.getAttribute('fillRule')).toBeNull();
    expect(svg?.getAttribute('fill')).toBe('currentColor');
    expect(svg?.getAttribute('stroke')).toBeNull();
  });
});
