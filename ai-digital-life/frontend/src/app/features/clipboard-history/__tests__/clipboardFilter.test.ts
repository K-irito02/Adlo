import { describe, expect, it } from 'vitest';
import type { ClipboardItem } from '@shared/ipc/clipboard';
import {
  buildClipboardFilterInput,
  filterClipboardItems,
  getClipboardKindCounts,
} from '../clipboardFilter';

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
  it('counts items by kind in canonical order', () => {
    expect(getClipboardKindCounts(ITEMS)).toEqual([
      { kind: 'text', count: 3 },
      { kind: 'image', count: 1 },
    ]);
  });

  it('keeps canonical order regardless of item order', () => {
    const reordered = [ITEMS[2], ITEMS[0]];
    expect(getClipboardKindCounts(reordered)).toEqual([
      { kind: 'text', count: 1 },
      { kind: 'image', count: 1 },
    ]);
  });

  it('sorts unknown kinds after known ones', () => {
    const withUnknown = [...ITEMS, makeItem('5', 'files', 'x')];
    expect(getClipboardKindCounts(withUnknown).map((c) => c.kind)).toEqual([
      'text',
      'image',
      'files',
    ]);
  });

  it('returns empty for empty history', () => {
    expect(getClipboardKindCounts([])).toEqual([]);
  });
});

describe('buildClipboardFilterInput', () => {
  it('uses the query only while the search panel is open', () => {
    const base = {
      kindFilter: 'text',
      query: 'good',
      matchCase: true,
      matchWholeWord: false,
      useRegex: false,
    };
    expect(buildClipboardFilterInput({ ...base, searchOpen: true })).toEqual({
      kindFilter: 'text',
      query: 'good',
      matchCase: true,
      wholeWord: false,
      useRegex: false,
    });
    expect(buildClipboardFilterInput({ ...base, searchOpen: false }).query).toBe('');
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

  it('returns nothing for an invalid regex', () => {
    const result = filterClipboardItems(ITEMS, {
      kindFilter: 'all',
      query: '([',
      useRegex: true,
    });
    expect(result).toEqual([]);
  });

  it('honours matchCase and wholeWord', () => {
    expect(
      filterClipboardItems(ITEMS, { kindFilter: 'all', query: 'hello', matchCase: true }).map(
        (item) => item.id,
      ),
    ).toEqual(['2']);
    expect(
      filterClipboardItems(ITEMS, { kindFilter: 'all', query: 'hell', wholeWord: true }),
    ).toEqual([]);
  });
});
