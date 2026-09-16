import { describe, expect, it } from 'vitest';
import type { CopyDict } from '../types';
import { formatT } from '../formatT';

const t = {
  plain: 'no vars',
  greet: 'Hello {name}',
  two: '{a} and {b}',
  nested: '{scope}（{options}）',
  numeric: '{n} min ago',
  missing: 'value {unknown}',
} as unknown as CopyDict;

describe('formatT', () => {
  it('returns the raw template when no vars are passed', () => {
    expect(formatT(t, 'greet' as never)).toBe('Hello {name}');
  });

  it('substitutes string and numeric vars', () => {
    expect(formatT(t, 'greet' as never, { name: 'Ada' })).toBe('Hello Ada');
    expect(formatT(t, 'numeric' as never, { n: 5 })).toBe('5 min ago');
  });

  it('substitutes every placeholder occurrence in a single pass', () => {
    expect(formatT(t, 'two' as never, { a: 'x', b: 'y' })).toBe('x and y');
  });

  it('does not re-scan injected values for placeholders', () => {
    // 先注入的文本含 {b} 时不得被后续替换命中
    expect(formatT(t, 'two' as never, { a: 'literal {b}', b: 'y' })).toBe('literal {b} and y');
    expect(formatT(t, 'nested' as never, { scope: 'search "{options}"', options: 'regex' })).toBe(
      'search "{options}"（regex）',
    );
  });

  it('leaves unknown placeholders untouched', () => {
    expect(formatT(t, 'missing' as never, { other: 1 })).toBe('value {unknown}');
  });

  it('does not interpret replacement patterns such as $& in values', () => {
    expect(formatT(t, 'greet' as never, { name: '$&' })).toBe('Hello $&');
  });

  it('falls back to the key when the key is missing', () => {
    expect(formatT(t, 'nope' as never)).toBe('nope');
  });
});
