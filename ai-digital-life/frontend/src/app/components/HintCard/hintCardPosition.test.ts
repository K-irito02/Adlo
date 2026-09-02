import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computePosition } from './hintCardPosition';
import type { Placement } from './hintCardPosition';

function makeRect(left: number, top: number, w: number = 16, h: number = 16): DOMRect {
  return {
    left,
    top,
    right: left + w,
    bottom: top + h,
    width: w,
    height: h,
    x: left,
    y: top,
    toJSON() {},
  };
}

describe('computePosition', () => {
  beforeEach(() => {
    vi.stubGlobal('innerWidth', 1200);
    vi.stubGlobal('innerHeight', 800);
  });

  it('top: card above trigger, arrow points down', () => {
    const trigger = makeRect(500, 400);
    const result = computePosition({
      triggerRect: trigger,
      cardWidth: 200,
      cardHeight: 100,
      placement: 'top',
    });
    expect(result.placement).toBe('top');
    expect(result.card.top).toBe(400 - 100 - 5); // trigger.top - cardH - gap
    expect(result.arrow.top).toBeGreaterThan(result.card.top);
  });

  it('bottom: card below trigger, arrow points up', () => {
    const trigger = makeRect(500, 100);
    const result = computePosition({
      triggerRect: trigger,
      cardWidth: 200,
      cardHeight: 100,
      placement: 'bottom',
    });
    expect(result.placement).toBe('bottom');
    expect(result.card.top).toBe(100 + 16 + 5); // trigger.bottom + gap
  });

  it('left: card to the left, arrow points right', () => {
    const trigger = makeRect(500, 300);
    const result = computePosition({
      triggerRect: trigger,
      cardWidth: 200,
      cardHeight: 100,
      placement: 'left',
    });
    expect(result.placement).toBe('left');
    expect(result.card.left).toBe(500 - 200 - 5);
  });

  it('right: card to the right, arrow points left', () => {
    const trigger = makeRect(500, 300);
    const result = computePosition({
      triggerRect: trigger,
      cardWidth: 200,
      cardHeight: 100,
      placement: 'right',
    });
    expect(result.placement).toBe('right');
    expect(result.card.left).toBe(500 + 16 + 5);
  });

  it('auto: prefers right when space available', () => {
    const trigger = makeRect(500, 400);
    const result = computePosition({ triggerRect: trigger, cardWidth: 200, cardHeight: 100 });
    expect(result.placement).toBe('right');
  });

  it('auto: flips to right when no space on top', () => {
    const trigger = makeRect(500, 10); // near top edge
    const result = computePosition({ triggerRect: trigger, cardWidth: 200, cardHeight: 100 });
    expect(result.placement).toBe('right');
  });

  it('auto: flips to right when no space on top or bottom', () => {
    const trigger = makeRect(500, 5); // very near top
    const result = computePosition({ triggerRect: trigger, cardWidth: 600, cardHeight: 200 });
    expect(['right', 'left']).toContain(result.placement);
  });

  it('horizontal clamp: arrow stays within card bounds', () => {
    const trigger = makeRect(1100, 300); // near right edge
    const result = computePosition({
      triggerRect: trigger,
      cardWidth: 480,
      cardHeight: 100,
      placement: 'top',
    });
    const arrowLeft = result.arrow.left;
    const cardLeft = result.card.left;
    expect(arrowLeft).toBeGreaterThanOrEqual(cardLeft + 5);
    expect(arrowLeft).toBeLessThanOrEqual(cardLeft + 480 - 5);
  });

  it('left placement flips to right when no space', () => {
    const trigger = makeRect(5, 300); // near left edge
    const result = computePosition({
      triggerRect: trigger,
      cardWidth: 200,
      cardHeight: 100,
      placement: 'left',
    });
    expect(result.placement).toBe('right');
  });
});
