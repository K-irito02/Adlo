// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { RevealHighlightLayers } from '@components/RevealHighlight';
import {
  clearHighlight,
  highlightElement,
  REVEAL_HIGHLIGHT_CLASS,
  REVEAL_HIGHLIGHT_VIEWPORT_CLASS,
} from '../revealHighlight';

/** 宿主（不滚动的内容外框）+ 常驻覆盖层 + 目标元素；jsdom 无布局，矩形与 offsetParent 显式桩定。 */
function hostFixture(): { host: HTMLElement; overlay: HTMLElement; target: HTMLElement } {
  const host = document.createElement('div');
  host.innerHTML =
    `<div class="${REVEAL_HIGHLIGHT_VIEWPORT_CLASS}">` +
    `<div class="${REVEAL_HIGHLIGHT_CLASS}"></div></div>` +
    '<p></p>';
  document.body.appendChild(host);
  const overlay = host.querySelector(`.${REVEAL_HIGHLIGHT_CLASS}`) as HTMLElement;
  const target = host.querySelector('p') as HTMLElement;
  Object.defineProperty(overlay, 'offsetParent', { value: host });
  host.getBoundingClientRect = () => ({ top: 0, height: 400 }) as DOMRect;
  target.getBoundingClientRect = () => ({ top: 120, height: 30 }) as DOMRect;
  return { host, overlay, target };
}

describe('RevealHighlight', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    cleanup();
    document.body.innerHTML = '';
  });

  it('renders the clipped viewport layer holding the highlight bar', () => {
    const { container } = render(<RevealHighlightLayers />);
    const viewport = container.querySelector(`.${REVEAL_HIGHLIGHT_VIEWPORT_CLASS}`);
    expect(viewport).not.toBeNull();
    // 高亮条必须是夹层的子节点，夹层才能把它的溢出裁掉（不给宿主制造可滚动溢出）。
    expect(viewport?.firstElementChild?.className).toBe(REVEAL_HIGHLIGHT_CLASS);
    expect(viewport?.getAttribute('aria-hidden')).toBe('true');
  });

  it('plays the highlight aligned to the target and writes the duration variable', () => {
    const { host, overlay, target } = hostFixture();
    expect(highlightElement(host, target, { variant: 'accent', durationMs: 900 })).toBe(true);
    expect(overlay.classList.contains('is-active')).toBe(true);
    expect(overlay.style.top).toBe('120px');
    expect(overlay.style.height).toBe('30px');
    expect(overlay.style.getPropertyValue('--adl-reveal-highlight-duration')).toBe('900ms');
  });

  it('switches variant classes on replay instead of stacking both', () => {
    const { host, overlay, target } = hostFixture();
    highlightElement(host, target, { variant: 'warning' });
    expect(overlay.classList.contains('adl-reveal-highlight--warning')).toBe(true);

    highlightElement(host, target, { variant: 'accent' });
    expect(overlay.classList.contains('adl-reveal-highlight--accent')).toBe(true);
    // 上一次的配色不得残留（两个变体类同时存在时，后声明的规则会静默覆盖前者）。
    expect(overlay.classList.contains('adl-reveal-highlight--warning')).toBe(false);
  });

  it('clears the highlight when the duration elapses', () => {
    const { host, overlay, target } = hostFixture();
    highlightElement(host, target, { variant: 'accent', durationMs: 1400 });
    vi.advanceTimersByTime(1400);
    expect(overlay.classList.contains('is-active')).toBe(false);
  });

  it('collapses the highlight when the target left the document', () => {
    const { host, overlay, target } = hostFixture();
    overlay.style.height = '40px';
    target.remove();
    highlightElement(host, target, { variant: 'accent' });
    expect(overlay.style.height).toBe('0px');
  });

  it('clearHighlight stops the animation and collapses the bar immediately', () => {
    const { host, overlay, target } = hostFixture();
    highlightElement(host, target, { variant: 'accent' });
    expect(overlay.classList.contains('is-active')).toBe(true);
    clearHighlight(host);
    expect(overlay.classList.contains('is-active')).toBe(false);
    expect(overlay.style.height).toBe('0px');
    // 定时器已取消：时长到期后不再有残留回调改动状态。
    vi.advanceTimersByTime(2000);
    expect(overlay.classList.contains('is-active')).toBe(false);
  });

  it('no-ops when the host has no layers mounted (return false, no throw)', () => {
    const host = document.createElement('div');
    const target = document.createElement('p');
    host.appendChild(target);
    expect(highlightElement(host, target, { variant: 'accent' })).toBe(false);
    expect(() => clearHighlight(host)).not.toThrow();
    expect(() => clearHighlight(null)).not.toThrow();
  });
});
