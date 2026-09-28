import { describe, it, expect } from 'vitest';
import { isPatchSatisfied } from './settingsGroups';

describe('isPatchSatisfied', () => {
  it('treats null/undefined as empty-string default (事项 12a)', () => {
    // config.fonts 为 null（Rust Option::None 序列化）与「全空串」默认等价。
    expect(isPatchSatisfied({ fonts: null }, { fonts: { uiFont: '', codeFont: '' } })).toBe(true);
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
  });
});
