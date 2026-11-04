import { describe, expect, it } from 'vitest';
import type { CopyDict } from '@i18n/types';
import { buildClipboardClearScope } from '../clipboardClearScope';

const t = {
  clipboardClearScopeSearch: '搜索"{query}"',
  clipboardClearScopeFilter: '筛选类型为"{kind}"',
  clipboardClearScopeJoin: '{a}和{b}',
  clipboardClearScopeOptions: '{scope}（{options}）',
  clipboardListSeparator: '、',
  searchPanelMatchCase: '区分大小写',
  searchPanelMatchWholeWord: '全字匹配',
  searchPanelUseRegex: '使用正则表达式',
} as unknown as CopyDict;

function makeInput(overrides: Partial<Parameters<typeof buildClipboardClearScope>[0]> = {}) {
  return {
    searchOpen: false,
    query: '',
    matchCase: false,
    matchWholeWord: false,
    useRegex: false,
    kindFilter: 'all',
    kindLabel: '文本',
    ...overrides,
  };
}

describe('buildClipboardClearScope', () => {
  it('returns undefined when nothing narrows the list', () => {
    expect(buildClipboardClearScope(makeInput(), t)).toBeUndefined();
  });

  it('returns undefined when search is open but the query is blank', () => {
    expect(
      buildClipboardClearScope(makeInput({ searchOpen: true, query: '   ' }), t),
    ).toBeUndefined();
  });

  it('ignores the query while the search panel is closed', () => {
    expect(buildClipboardClearScope(makeInput({ query: 'good' }), t)).toBeUndefined();
  });

  it('describes a search-only scope', () => {
    expect(buildClipboardClearScope(makeInput({ searchOpen: true, query: 'good' }), t)).toBe(
      '搜索"good"',
    );
  });

  it('describes a filter-only scope', () => {
    expect(buildClipboardClearScope(makeInput({ kindFilter: 'text' }), t)).toBe('筛选类型为"文本"');
  });

  it('joins search and filter scopes', () => {
    expect(
      buildClipboardClearScope(
        makeInput({ searchOpen: true, query: 'good', kindFilter: 'text' }),
        t,
      ),
    ).toBe('搜索"good"和筛选类型为"文本"');
  });

  it('appends the active search options after the query', () => {
    expect(
      buildClipboardClearScope(
        makeInput({ searchOpen: true, query: 'good', matchCase: true, useRegex: true }),
        t,
      ),
    ).toBe('搜索"good"（区分大小写、使用正则表达式）');
  });

  it('appends options together with a kind filter', () => {
    expect(
      buildClipboardClearScope(
        makeInput({
          searchOpen: true,
          query: 'good',
          matchWholeWord: true,
          kindFilter: 'image',
          kindLabel: '图片',
        }),
        t,
      ),
    ).toBe('搜索"good"（全字匹配）和筛选类型为"图片"');
  });
});
