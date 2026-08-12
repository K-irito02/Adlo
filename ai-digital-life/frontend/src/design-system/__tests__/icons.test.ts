import { describe, it, expect } from 'vitest';
import { renderIcon } from '../icons';

function renderChevron(
  name: 'chevron-left' | 'chevron-right' | 'chevron-down' | 'chevron-up',
): string {
  const html = renderIcon(name, { decorative: true });
  return html.value;
}

function renderAlert(name: 'alert-octagon' | 'alert-circle' | 'info'): string {
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

describe('design-system alert icon geometry', () => {
  it('alert-circle renders a circular alert badge', () => {
    expect(renderAlert('alert-circle')).toContain('<circle cx="12" cy="12" r="10"');
    expect(renderAlert('alert-circle')).toContain('M12 16h.01');
  });

  it('alert-octagon keeps its octagonal outline', () => {
    expect(renderAlert('alert-octagon')).toContain('<polygon points="7.86 2');
  });

  it('info renders the information dot and stem', () => {
    expect(renderAlert('info')).toContain('<circle cx="12" cy="12" r="10"');
    expect(renderAlert('info')).toContain('M12 16v-4');
  });
});
