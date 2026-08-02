import { describe, it, expect } from 'vitest';
import { renderIcon } from '../icons';

function renderChevron(
  name: 'chevron-left' | 'chevron-right' | 'chevron-down' | 'chevron-up',
): string {
  const html = renderIcon(name, { decorative: true });
  return html.value;
}

describe('design-system chevron icon geometry', () => {
  it('chevron-left renders the left-pointing chevron path', () => {
    expect(renderChevron('chevron-left')).toContain('M14 7L9 12L14 17');
  });

  it('chevron-right renders the right-pointing chevron path', () => {
    expect(renderChevron('chevron-right')).toContain('M10 17L15 12L10 7');
  });

  it('chevron-down renders the down-pointing chevron path', () => {
    expect(renderChevron('chevron-down')).toContain('M7 10L12 15L17 10');
  });

  it('chevron-up renders the up-pointing chevron path', () => {
    expect(renderChevron('chevron-up')).toContain('M17 14L12 9L7 14');
  });
});
