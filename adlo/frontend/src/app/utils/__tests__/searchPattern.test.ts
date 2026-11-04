import { describe, expect, it } from 'vitest';
import { buildSearchPattern, escapeRegExp } from '../searchPattern';

describe('escapeRegExp', () => {
  it('escapes regex metacharacters', () => {
    expect(escapeRegExp('a.b*c')).toBe('a\\.b\\*c');
  });
});

describe('buildSearchPattern', () => {
  const base = { matchCase: false, wholeWord: false, useRegex: false };

  it('matches case-insensitively by default', () => {
    expect(buildSearchPattern('hello', base)?.test('Hello World')).toBe(true);
  });

  it('respects matchCase', () => {
    const pattern = buildSearchPattern('hello', { ...base, matchCase: true });
    expect(pattern?.test('Hello World')).toBe(false);
    if (pattern) {
      pattern.lastIndex = 0;
    }
    expect(pattern?.test('hello again')).toBe(true);
  });

  it('respects wholeWord', () => {
    const pattern = buildSearchPattern('hell', { ...base, wholeWord: true });
    expect(pattern?.test('hello')).toBe(false);
    if (pattern) {
      pattern.lastIndex = 0;
    }
    expect(pattern?.test('hell')).toBe(true);
  });

  it('supports regex and returns undefined for invalid regex', () => {
    expect(buildSearchPattern('h.llo', { ...base, useRegex: true })?.test('hello')).toBe(true);
    expect(buildSearchPattern('([', { ...base, useRegex: true })).toBeUndefined();
  });

  it('treats blank queries as empty queries', () => {
    expect(buildSearchPattern('   ', base)).toBeUndefined();
    expect(buildSearchPattern('', base)).toBeUndefined();
  });
});
