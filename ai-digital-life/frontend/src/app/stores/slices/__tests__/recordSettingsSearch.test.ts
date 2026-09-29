// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../../slicedStore';
import { SETTINGS_SEARCH_HISTORY_MAX, SETTINGS_SEARCH_HISTORY_MAX_LENGTH } from '../uiSliceTypes';

/**
 * `recordSettingsSearch` 的写入口径单测。
 *
 * 组件侧的用例只覆盖「点结果 → 历史被更新」这一条链路；本文件锁住写入口径本身：
 * trim、空白不入、去重置顶、首条重复不写盘、条数上限、单条长度上限。
 * 「不写盘」用**数组引用不变**观测：命中守卫时不调用 `set(persistField(...))`，
 * store 里的同一数组对象原样保留（一旦回归成「每次都写」，引用必然换新）。
 */
const record = (query: string) => useAppStore.getState().recordSettingsSearch(query);
const history = () => useAppStore.getState().settingsSearchHistory;

describe('recordSettingsSearch', () => {
  beforeEach(() => {
    useAppStore.setState({ settingsSearchHistory: [] });
  });

  afterEach(() => {
    useAppStore.setState({ settingsSearchHistory: [] });
  });

  it('trims the query before storing', () => {
    record('  theme  ');
    expect(history()).toEqual(['theme']);
  });

  it('ignores blank queries', () => {
    const before = history();
    record('   ');
    expect(history()).toBe(before);
    expect(history()).toEqual([]);
  });

  it('omits the write when the entry is already first (no per-jump write amplification)', () => {
    record('theme');
    const afterFirst = history();
    record('theme');
    expect(history()).toBe(afterFirst);
  });

  it('moves an existing entry to the front instead of duplicating it', () => {
    record('font');
    record('theme');
    record('font');
    expect(history()).toEqual(['font', 'theme']);
  });

  it('caps the list at the shared limit, dropping the oldest', () => {
    for (let index = 0; index < SETTINGS_SEARCH_HISTORY_MAX + 5; index += 1) {
      record(`q${index}`);
    }
    expect(history()).toHaveLength(SETTINGS_SEARCH_HISTORY_MAX);
    expect(history()[0]).toBe(`q${SETTINGS_SEARCH_HISTORY_MAX + 4}`);
    expect(history()).not.toContain('q0');
  });

  it('truncates a single entry to the shared length limit', () => {
    record('x'.repeat(SETTINGS_SEARCH_HISTORY_MAX_LENGTH + 50));
    expect(history()).toEqual(['x'.repeat(SETTINGS_SEARCH_HISTORY_MAX_LENGTH)]);
  });
});
