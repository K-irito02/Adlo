import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { IconWorld } from '..';

describe('IconWorld', () => {
  it('should render World icon', () => {
    const { container } = render(<IconWorld size={16} decorative />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('width')).toBe('16');
    expect(svg?.getAttribute('height')).toBe('16');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg?.getAttribute('fill')).toBe('none');
    expect(svg?.getAttribute('stroke')).toBe('currentColor');

    const path = svg?.querySelector('path');
    expect(path).not.toBeNull();
    expect(path?.getAttribute('fill')).toBe('currentColor');
    // 填充型图标禁用 make() 继承的 2px 描边：避免实心球体带粗描边看起来像 emoji
    expect(path?.getAttribute('stroke')).toBe('none');
    expect(path?.getAttribute('d')).toContain('M12 2C6.45161 2 2 6.48387');
  });
});
