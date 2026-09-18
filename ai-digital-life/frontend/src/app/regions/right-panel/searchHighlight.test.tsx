// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { highlightMatch } from './searchHighlight';

function texts(node: React.ReactNode): string[] {
  const out: string[] = [];
  const walk = (value: React.ReactNode): void => {
    if (typeof value === 'string') {
      out.push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (value !== null && typeof value === 'object' && 'props' in value) {
      walk((value as { props: { children?: React.ReactNode } }).props.children);
    }
  };
  walk(node);
  return out;
}

/** 仅收集 <mark> 高亮片段的文本（排除未高亮的剩余文本）。 */
function marks(node: React.ReactNode): string[] {
  const out: string[] = [];
  const walk = (value: React.ReactNode): void => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (value !== null && typeof value === 'object' && 'props' in value) {
      const props = (value as { props: { children?: React.ReactNode } }).props;
      if ((value as { type?: unknown }).type === 'mark') {
        out.push(String(props.children ?? ''));
        return;
      }
      walk(props.children);
    }
  };
  walk(node);
  return out;
}

describe('highlightMatch', () => {
  it('highlights substrings by default (file names)', () => {
    expect(texts(highlightMatch('needle in a haystack', 'needle', false))).toContain('needle');
  });

  it('highlights regex matches with the search semantics', () => {
    const out = texts(
      highlightMatch('needle here and needle again', 'needle \\w+', false, {
        matchCase: false,
        useRegex: true,
      }),
    );
    expect(out).toContain('needle here');
    expect(out).toContain('needle again');
  });

  it('does not highlight partial words when wholeWord is set', () => {
    const marked = marks(
      highlightMatch('needle needles', 'needle', false, { matchCase: false, wholeWord: true }),
    );
    expect(marked).toEqual(['needle']);
  });

  it('falls back to substring on invalid regex', () => {
    expect(
      texts(highlightMatch('a (b c', '(b', false, { matchCase: false, useRegex: true })),
    ).toContain('(b');
  });
});
