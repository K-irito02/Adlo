import { describe, expect, it } from 'vitest';
import type { ClipboardItem } from '@shared/ipc/clipboard';
import {
  buildClipboardSearchPattern,
  filterClipboardItems,
  getClipboardKindCounts,
} from './clipboardFilter';

function makeItem(id: string, kind: string, content?: string): ClipboardItem {
  return {
    id,
    kind,
    content,
    digest: null,
    imagePath: undefined,
    thumbPath: undefined,
    imageWidth: undefined,
    imageHeight: undefined,
    sourceApp: undefined,
    createdAt: Number(id),
  } as unknown as ClipboardItem;
}

const ITEMS = [
  makeItem('1', 'text', 'Hello World'),
  makeItem('2', 'text', 'hello again'),
  makeItem('3', 'image', undefined),
  makeItem('4', 'text', 'bye'),
];

describe('getClipboardKindCounts', () => {
  it('counts items by kind preserving first-seen order', () => {
    expect(getClipboardKindCounts(ITEMS)).toEqual([
      { kind: 'text', count: 3 },
      { kind: 'image', count: 1 },
    ]);
  });

  it('returns empty for empty history', () => {
    expect(getClipboardKindCounts([])).toEqual([]);
  });
});

describe('buildClipboardSearchPattern', () => {
  it('matches case-insensitively by default', () => {
    const pattern = buildClipboardSearchPattern('hello', {
      matchCase: false,
      wholeWord: false,
      useRegex: false,
    });
    expect(pattern?.test('Hello World')).toBe(true);
  });

  it('respects matchCase', () => {
    const pattern = buildClipboardSearchPattern('hello', {
      matchCase: true,
      wholeWord: false,
      useRegex: false,
    });
    expect(pattern?.test('Hello World')).toBe(false);
    expect(pattern?.test('hello again')).toBe(true);
  });

  it('respects wholeWord', () => {
    const pattern = buildClipboardSearchPattern('hell', {
      matchCase: false,
      wholeWord: true,
      useRegex: false,
    });
    expect(pattern?.test('hello')).toBe(false);
    expect(pattern?.test('hell')).toBe(true);
  });

  it('supports regex and returns undefined for invalid regex', () => {
    const ok = buildClipboardSearchPattern('h.llo', {
      matchCase: false,
      wholeWord: false,
      useRegex: true,
    });
    expect(ok?.test('hello')).toBe(true);
    expect(
      buildClipboardSearchPattern('([', {
        matchCase: false,
        wholeWord: false,
        useRegex: true,
      }),
    ).toBeUndefined();
  });

  it('returns undefined for empty query', () => {
    expect(
      buildClipboardSearchPattern('  ', { matchCase: false, wholeWord: false, useRegex: false }),
    ).toBeUndefined();
  });
});

describe('filterClipboardItems', () => {
  it('returns all items when kind is all and query is empty', () => {
    expect(filterClipboardItems(ITEMS, { kindFilter: 'all', query: '' })).toHaveLength(4);
  });

  it('filters by kind only', () => {
    const result = filterClipboardItems(ITEMS, { kindFilter: 'image', query: '' });
    expect(result.map((item) => item.id)).toEqual(['3']);
  });

  it('filters by query across content and kind', () => {
    const result = filterClipboardItems(ITEMS, { kindFilter: 'all', query: 'hello' });
    expect(result.map((item) => item.id)).toEqual(['1', '2']);
  });

  it('combines kind filter and query', () => {
    const result = filterClipboardItems(ITEMS, { kindFilter: 'text', query: 'hello' });
    expect(result.map((item) => item.id)).toEqual(['1', '2']);
    expect(filterClipboardItems(ITEMS, { kindFilter: 'image', query: 'hello' })).toEqual([]);
  });

  it('matches image items by kind label query', () => {
    const result = filterClipboardItems(ITEMS, { kindFilter: 'all', query: 'image' });
    expect(result.map((item) => item.id)).toEqual(['3']);
  });
});
