// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { findLineForQuery, resolveSourceLineElement, revealSourceLine } from './revealSourceLine';

function container(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
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
  it('scrolls to the resolved element and adds the flash class', () => {
    const root = container('<p data-source-line-start="1" data-source-line-end="1">a</p>');
    const target = root.querySelector('p') as HTMLElement;
    let scrolled = false;
    target.scrollIntoView = () => {
      scrolled = true;
    };
    expect(revealSourceLine(root, 1, { flash: true })).toBe(true);
    expect(scrolled).toBe(true);
    expect(target.classList.contains('adl-md-flash')).toBe(true);
  });

  it('returns false without throwing when nothing matches', () => {
    expect(revealSourceLine(container('<p>plain</p>'), 5)).toBe(false);
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
});
