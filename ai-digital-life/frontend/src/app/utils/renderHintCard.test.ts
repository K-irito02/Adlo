import { describe, it, expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { renderHintCard } from './renderHintCard';

afterEach(() => {
  document
    .querySelectorAll(
      '.adl-sub-hint-card, .adl-sub-hint-card__arrow, .adl-sub-hint-card__arrow-border',
    )
    .forEach((el) => el.remove());
  cleanup();
});

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

describe('renderHintCard', () => {
  it('appends card, arrow and arrow border to document.body, not the container', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    renderHintCard({
      content: 'hint text',
      buttonRect: rect(200, 100, 30, 30),
      menuRect: rect(100, 80, 100, 200),
      direction: 'right',
    });

    expect(container.querySelector('.adl-sub-hint-card')).toBeNull();
    expect(document.querySelector('.adl-sub-hint-card')).not.toBeNull();
    expect(document.querySelector('.adl-sub-hint-card__arrow')).not.toBeNull();
    expect(document.querySelector('.adl-sub-hint-card__arrow-border')).not.toBeNull();

    container.remove();
  });

  it('positions the card in viewport space with menuRect->card gap of 1px', () => {
    const menuLeft = 100;
    const menuTop = 80;
    const menuRight = 250;
    const centerY = 115;

    renderHintCard({
      content: 'hint text',
      buttonRect: rect(200, 100, 30, 30),
      menuRect: rect(menuLeft, menuTop, 150, 200),
      direction: 'right',
    });

    const card = document.querySelector<HTMLElement>('.adl-sub-hint-card')!;
    expect(card.style.left).toBe(`${menuRight + 1}px`);
    expect(card.style.top).toBe(`${centerY}px`);
    expect(card.style.transform).toBe('translateY(-50%)');

    const arrow = document.querySelector<HTMLElement>('.adl-sub-hint-card__arrow')!;
    expect(arrow.style.left).toBe(`${menuRight - 4}px`);
    expect(arrow.style.top).toBe(`${centerY - 4}px`);
  });
});
