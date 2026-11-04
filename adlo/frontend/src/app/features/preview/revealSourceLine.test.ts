// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  findLineForQuery,
  resolveSourceLineElement,
  revealSourceLine,
  scrollAndFlash,
} from './revealSourceLine';

function container(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

function stubRect(el: HTMLElement, top: number, height: number): void {
  el.getBoundingClientRect = () =>
    ({
      top,
      height,
      bottom: top + height,
      left: 0,
      right: 0,
      width: 0,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
}

function captureScrollBehavior(target: HTMLElement): string[] {
  const behaviors: string[] = [];
  target.scrollIntoView = (options?: boolean | ScrollIntoViewOptions) => {
    behaviors.push(typeof options === 'object' && options ? String(options.behavior) : 'auto');
  };
  return behaviors;
}

/** 预览面（容器）+ 常驻高亮覆盖层 + 目标块；覆盖层的 offsetParent 显式指向容器。 */
function overlayFixture(): {
  root: HTMLElement;
  overlay: HTMLElement;
  target: HTMLElement;
} {
  const root = container(
    '<div class="adl-reveal-highlight-viewport"><div class="adl-reveal-highlight"></div></div><p data-source-line-start="1" data-source-line-end="1">a</p>',
  );
  const overlay = root.querySelector('.adl-reveal-highlight') as HTMLElement;
  const target = root.querySelector('p') as HTMLElement;
  Object.defineProperty(overlay, 'offsetParent', { value: root });
  stubRect(root, 0, 1000);
  stubRect(target, 100, 24);
  return { root, overlay, target };
}

describe('resolveSourceLineElement', () => {
  it('picks the innermost block containing the line (inclusive end)', () => {
    const root = container(
      '<ul data-source-line-start="6" data-source-line-end="8"><li data-source-line-start="7" data-source-line-end="8">x</li></ul>',
    );
    expect(resolveSourceLineElement(root, 7)?.tagName).toBe('LI');
  });

  it('matches single-line blocks where start equals end', () => {
    const root = container('<h1 data-source-line-start="1" data-source-line-end="1">t</h1>');
    expect(resolveSourceLineElement(root, 1)?.tagName).toBe('H1');
  });

  it('falls back to the nearest preceding block when nothing contains the line', () => {
    const root = container(
      '<p data-source-line-start="3" data-source-line-end="4">a</p><p data-source-line-start="10" data-source-line-end="11">b</p>',
    );
    expect(resolveSourceLineElement(root, 7)?.textContent).toBe('a');
  });

  it('returns null when the container has no mapped blocks', () => {
    expect(resolveSourceLineElement(container('<p>plain</p>'), 5)).toBeNull();
  });
});

describe('revealSourceLine', () => {
  it('scrolls to the resolved element and returns true', () => {
    const root = container('<p data-source-line-start="1" data-source-line-end="1">a</p>');
    const target = root.querySelector('p') as HTMLElement;
    let scrolled = false;
    target.scrollIntoView = () => {
      scrolled = true;
    };
    expect(revealSourceLine(root, 1, { flash: true })).toBe(true);
    expect(scrolled).toBe(true);
  });

  it('returns false without throwing when nothing matches', () => {
    expect(revealSourceLine(container('<p>plain</p>'), 5)).toBe(false);
  });
});

describe('scrollAndFlash', () => {
  // 高亮带 1.4s 定时器 + rAF 跟踪循环：用假时钟统一收敛，避免任务泄漏到环境销毁之后
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('jumps instantly when the target is far outside the viewport', () => {
    const { root, target } = overlayFixture();
    stubRect(target, 5000, 24);
    const behaviors = captureScrollBehavior(target);
    expect(scrollAndFlash(root, target, { flash: true })).toBe(true);
    expect(behaviors).toEqual(['instant']);
  });

  it('keeps smooth scrolling for a nearby target', () => {
    const { root, target } = overlayFixture();
    const behaviors = captureScrollBehavior(target);
    expect(scrollAndFlash(root, target, { flash: true })).toBe(true);
    expect(behaviors).toEqual(['smooth']);
  });

  it('aligns the overlay to the target and plays the highlight', () => {
    const { root, overlay, target } = overlayFixture();
    target.scrollIntoView = () => {};
    scrollAndFlash(root, target, { flash: true });
    expect(overlay.classList.contains('is-active')).toBe(true);
    expect(overlay.classList.contains('adl-reveal-highlight--warning')).toBe(true);
    expect(overlay.style.top).toBe('100px');
    expect(overlay.style.height).toBe('24px');
  });

  it('does not play a highlight when asked without flash', () => {
    const { root, overlay, target } = overlayFixture();
    target.scrollIntoView = () => {};
    scrollAndFlash(root, target);
    expect(overlay.classList.contains('is-active')).toBe(false);
  });

  it('survives a surface without an overlay element', () => {
    const root = container('<p data-source-line-start="1" data-source-line-end="1">a</p>');
    const target = root.querySelector('p') as HTMLElement;
    target.scrollIntoView = () => {};
    expect(scrollAndFlash(root, target, { flash: true })).toBe(true);
  });

  it('collapses the highlight when the target left the document (file switched mid-flash)', () => {
    // 旧目标块被替换后立即收起高亮条：既不冻结在旧像素位置，也不留下错位的黄带。
    const { root, overlay, target } = overlayFixture();
    target.scrollIntoView = () => {};
    overlay.style.top = '7px';
    overlay.style.height = '40px';
    target.remove();
    scrollAndFlash(root, target, { flash: true });
    expect(overlay.style.height).toBe('0px');
  });

  it('clears the highlight once the flash duration elapses', () => {
    const { root, overlay, target } = overlayFixture();
    target.scrollIntoView = () => {};
    scrollAndFlash(root, target, { flash: true });
    expect(overlay.classList.contains('is-active')).toBe(true);
    vi.advanceTimersByTime(1400);
    expect(overlay.classList.contains('is-active')).toBe(false);
  });
});

describe('findLineForQuery', () => {
  const content = ['alpha', 'needle here', 'beta', 'needle again'].join('\n');

  it('returns the preferred line when it still matches', () => {
    expect(
      findLineForQuery(
        content,
        'needle',
        { matchCase: false, wholeWord: false, useRegex: false },
        2,
      ),
    ).toBe(2);
  });

  it('relocates to the nearest matching line when the preferred one no longer matches', () => {
    expect(
      findLineForQuery(
        content,
        'needle',
        { matchCase: false, wholeWord: false, useRegex: false },
        3,
      ),
    ).toBe(2);
  });

  it('returns null when the content no longer contains the query', () => {
    expect(
      findLineForQuery(
        content,
        'absent',
        { matchCase: false, wholeWord: false, useRegex: false },
        1,
      ),
    ).toBeNull();
  });

  it('honors case sensitivity, whole word and regex options', () => {
    expect(
      findLineForQuery(
        content,
        'NEEDLE',
        { matchCase: true, wholeWord: false, useRegex: false },
        1,
      ),
    ).toBeNull();
    expect(
      findLineForQuery(content, 'needl', { matchCase: false, wholeWord: true, useRegex: false }, 1),
    ).toBeNull();
    expect(
      findLineForQuery(
        content,
        '^needle \\w+',
        { matchCase: false, wholeWord: false, useRegex: true },
        1,
      ),
    ).toBe(2);
  });

  it('prefers the largest end among preceding blocks, not document order', () => {
    const root = container(
      '<ul data-source-line-start="1" data-source-line-end="10"><li data-source-line-start="3" data-source-line-end="4">x</li></ul>',
    );
    expect(resolveSourceLineElement(root, 11)?.tagName).toBe('UL');
  });
});

describe('revealEditorLineSafely', () => {
  it('clamps line 0 to line 1 like the panel branch', async () => {
    const { revealEditorLineSafely } = await import('./revealSourceLine');
    const calls: string[] = [];
    const editor = {
      getModel: () => ({ getLineCount: () => 57 }),
      revealLineInCenter: (line: number) => calls.push(`reveal:${line}`),
      setPosition: () => {},
      focus: () => {},
    };
    expect(revealEditorLineSafely(editor as never, 0, { scope: 'test' })).toBe('clamped');
    expect(calls).toEqual(['reveal:1']);
  });
});
