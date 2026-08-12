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

describe('appendHintCardContent (via renderHintCard)', () => {
  it('renders bullet lines as structured DOM with .adl-sub-hint-card__bullet-line', () => {
    renderHintCard({
      content: '· item one\n· item two\n· item three',
      buttonRect: rect(200, 100, 30, 30),
      menuRect: rect(100, 80, 100, 200),
      direction: 'right',
    });

    const card = document.querySelector('.adl-sub-hint-card')!;
    const bulletLines = card.querySelectorAll('.adl-sub-hint-card__bullet-line');
    expect(bulletLines.length).toBe(3);

    const bullets = card.querySelectorAll('.adl-sub-hint-card__bullet');
    expect(bullets.length).toBe(3);
    bullets.forEach((b) => expect(b.textContent).toBe('·'));

    const texts = card.querySelectorAll('.adl-sub-hint-card__bullet-text');
    expect(texts.length).toBe(3);
    expect(texts[0].textContent).toBe('item one');
    expect(texts[1].textContent).toBe('item two');
    expect(texts[2].textContent).toBe('item three');
  });

  it('renders plain lines as .adl-sub-hint-card__line', () => {
    renderHintCard({
      content: 'line one\nline two',
      buttonRect: rect(200, 100, 30, 30),
      menuRect: rect(100, 80, 100, 200),
      direction: 'right',
    });

    const card = document.querySelector('.adl-sub-hint-card')!;
    const lines = card.querySelectorAll('.adl-sub-hint-card__line');
    expect(lines.length).toBe(2);
    expect(lines[0].textContent).toBe('line one');
    expect(lines[1].textContent).toBe('line two');
  });

  it('inserts <br> for empty lines between non-empty lines', () => {
    renderHintCard({
      content: 'header\n· bullet\n\nfooter',
      buttonRect: rect(200, 100, 30, 30),
      menuRect: rect(100, 80, 100, 200),
      direction: 'right',
    });

    const card = document.querySelector('.adl-sub-hint-card')!;
    const brs = card.querySelectorAll('br');
    expect(brs.length).toBe(1);
  });

  it('handles mixed content with bullet and plain lines', () => {
    renderHintCard({
      content: '· first\nnormal\n· last',
      buttonRect: rect(200, 100, 30, 30),
      menuRect: rect(100, 80, 100, 200),
      direction: 'right',
    });

    const card = document.querySelector('.adl-sub-hint-card')!;
    expect(card.querySelectorAll('.adl-sub-hint-card__bullet-line').length).toBe(2);
    expect(card.querySelectorAll('.adl-sub-hint-card__line').length).toBe(1);
  });
});

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

  it('positions the card in viewport space with menuRect->card gap of 1px (direction: right)', () => {
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

  it('positions the card correctly when direction is left', () => {
    const menuLeft = 100;
    const centerY = 115;
    const expectedRight = window.innerWidth - menuLeft + 1;

    renderHintCard({
      content: 'hint text',
      buttonRect: rect(200, 100, 30, 30),
      menuRect: rect(menuLeft, 80, 150, 200),
      direction: 'left',
    });

    const card = document.querySelector<HTMLElement>('.adl-sub-hint-card')!;
    expect(card.style.right).toBe(`${expectedRight}px`);
    expect(card.style.top).toBe(`${centerY}px`);
    expect(card.style.transform).toBe('translateY(-50%)');

    const arrow = document.querySelector<HTMLElement>('.adl-sub-hint-card__arrow')!;
    expect(arrow.style.left).toBe(`${menuLeft}px`);
    expect(arrow.style.top).toBe(`${centerY - 4}px`);
  });
});
