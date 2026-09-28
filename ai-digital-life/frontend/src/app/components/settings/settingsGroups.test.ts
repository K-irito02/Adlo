import { describe, it, expect } from 'vitest';
import { DEFAULT_FONTS } from '../../../shared/defaultPreferences';
import { isPatchSatisfied } from './settingsGroups';

describe('isPatchSatisfied', () => {
  it('treats null/undefined as empty-string default (事项 12a)', () => {
    // config.fonts 为 null（Rust Option::None 序列化）与「全空串」默认等价。
    expect(isPatchSatisfied({ fonts: null }, { fonts: { uiFont: '', codeFont: '' } })).toBe(true);
    // 用真实 DEFAULT_FONTS 形状锁定（Phase 4 R1-2.3）：新增字体键由工厂覆盖，不断言过期字面量。
    expect(isPatchSatisfied({ fonts: null }, { fonts: { ...DEFAULT_FONTS } })).toBe(true);
    expect(isPatchSatisfied({ fonts: { uiFont: 'X' } }, { fonts: { ...DEFAULT_FONTS } })).toBe(
      false,
    );
    expect(isPatchSatisfied({ a: null }, { a: '' })).toBe(true);
    expect(isPatchSatisfied({ a: undefined }, { a: '' })).toBe(true);
  });

  it('keeps missing non-empty defaults non-default (fail-open)', () => {
    expect(isPatchSatisfied({ a: null }, { a: 'info' })).toBe(false);
    expect(isPatchSatisfied({ fonts: null }, { fonts: { uiFont: 'X' } })).toBe(false);
    expect(isPatchSatisfied({}, { fonts: { uiFont: '', codeFont: '' } })).toBe(true);
  });

  it('never throws on null actual in the array branch (Phase 4 R3-12a-L1)', () => {
    expect(isPatchSatisfied({ ids: null }, { ids: ['a'] })).toBe(false);
    expect(isPatchSatisfied({ ids: ['a'] }, { ids: ['a'] })).toBe(true);
    expect(isPatchSatisfied({ ids: ['a'] }, { ids: ['b'] })).toBe(false);
    expect(isPatchSatisfied({ ids: ['a', 'b'] }, { ids: ['a'] })).toBe(false);
    // actual 为非数组标量同样判非默认（Phase 4 R3-L12）。
    expect(isPatchSatisfied({ ids: 'a' }, { ids: ['a'] })).toBe(false);
    // 数字 0 / false 缺失不放宽（仅空串放宽）。
    expect(isPatchSatisfied({ n: null }, { n: 0 })).toBe(false);
    expect(isPatchSatisfied({ b: null }, { b: false })).toBe(false);
  });
});
