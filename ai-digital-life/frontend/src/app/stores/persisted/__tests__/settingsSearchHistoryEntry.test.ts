// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { registry } from '../registry';
import {
  SETTINGS_SEARCH_HISTORY_MAX,
  SETTINGS_SEARCH_HISTORY_MAX_LENGTH,
} from '../../slices/uiSliceTypes';

/**
 * `adl:ui.settingsSearchHistory` 的**读盘规整**（消费方依赖「非空、已去重、已截断」成立，
 * 而写入侧只保证本进程写出的形态干净）。直接驱动登记条目的 `read`，不经过 localStorage。
 */
const read = (raw: unknown) => registry['adl:ui.settingsSearchHistory'].read?.(raw);

describe('adl:ui.settingsSearchHistory read normalization', () => {
  it('rejects shapes the generic parser rejects (kept as "invalid → fallback")', () => {
    expect(read('theme')).toBeUndefined();
    expect(read(['theme', 1])).toBeUndefined();
    expect(read({})).toBeUndefined();
  });

  it('trims, drops blanks and dedupes, keeping the newer-first order', () => {
    expect(read(['  theme  ', '', '   ', 'font', 'theme'])).toEqual(['theme', 'font']);
  });

  it('truncates entries longer than the shared length limit', () => {
    const long = 'x'.repeat(SETTINGS_SEARCH_HISTORY_MAX_LENGTH + 10);
    const result = read([long]);
    expect(result).toEqual(['x'.repeat(SETTINGS_SEARCH_HISTORY_MAX_LENGTH)]);
  });

  it('normalizes before capping, so dirty entries cannot squeeze out valid ones', () => {
    // 3 条脏数据（空白/重复）+ 上限内有效条目：先截断再规整会让有效条目被挤掉。
    const dirty = [
      '',
      '   ',
      'dup',
      'dup',
      ...Array.from({ length: SETTINGS_SEARCH_HISTORY_MAX }, (_, i) => `q${i}`),
    ];
    const result = read(dirty)!;
    expect(result).toHaveLength(SETTINGS_SEARCH_HISTORY_MAX);
    expect(result[0]).toBe('dup');
    expect(result).toContain(`q${SETTINGS_SEARCH_HISTORY_MAX - 2}`);
  });

  it('caps the list at the shared limit', () => {
    const result = read(
      Array.from({ length: SETTINGS_SEARCH_HISTORY_MAX + 3 }, (_, i) => `q${i}`),
    )!;
    expect(result).toHaveLength(SETTINGS_SEARCH_HISTORY_MAX);
  });
});
