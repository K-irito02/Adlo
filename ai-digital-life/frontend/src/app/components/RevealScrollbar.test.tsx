import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { RevealScrollbar } from './RevealScrollbar';
import type { RevealScrollbarController } from '../hooks/useRevealScrollbar';

function makeController(overrides: Partial<RevealScrollbarController>): RevealScrollbarController {
  return {
    scrollRef: { current: null },
    hoverProps: { onMouseEnter: () => {}, onMouseLeave: () => {} },
    visible: false,
    scrollable: false,
    axis: 'vertical',
    thumbLength: 24,
    thumbOffset: 0,
    thumbStyle: { height: '24px', transform: 'translateY(0px)' },
    thumbListeners: { onPointerDown: () => {} },
    ...overrides,
  };
}

describe('RevealScrollbar', () => {
  it('renders nothing when not scrollable', () => {
    const { container } = render(
      <RevealScrollbar controller={makeController({ scrollable: false })} />,
    );
    expect(container.querySelector('.adl-reveal-scrollbar')).toBeNull();
  });

  it('renders track and thumb with controller state when scrollable', () => {
    const { container } = render(
      <RevealScrollbar controller={makeController({ scrollable: true, visible: true })} />,
    );
    const track = container.querySelector('.adl-reveal-scrollbar') as HTMLElement;
    expect(track).not.toBeNull();
    expect(track.getAttribute('data-visible')).toBe('true');
    const thumb = track.querySelector('.adl-reveal-scrollbar__thumb') as HTMLElement;
    expect(thumb).toHaveStyle({ height: '24px' });
    expect(track.getAttribute('aria-hidden')).toBe('true');
    expect(track.getAttribute('data-axis')).toBe('vertical');
  });

  it('marks horizontal axis on the track (settings panel fallback bar)', () => {
    const { container } = render(
      <RevealScrollbar
        controller={makeController({
          scrollable: true,
          visible: true,
          axis: 'horizontal',
          thumbStyle: { width: '60px', transform: 'translateX(0px)' },
        })}
      />,
    );
    const track = container.querySelector('.adl-reveal-scrollbar') as HTMLElement;
    expect(track.getAttribute('data-axis')).toBe('horizontal');
    const thumb = track.querySelector('.adl-reveal-scrollbar__thumb') as HTMLElement;
    expect(thumb).toHaveStyle({ width: '60px' });
  });
});
