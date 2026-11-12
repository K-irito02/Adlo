import { describe, it, expect } from 'vitest';
import type { SettingsGroupId } from '@shared/ipc';
import { DEFAULT_FONTS } from '../../../shared/defaultPreferences';
import {
  GROUP_RESET_PATCHES,
  RESETTABLE_GROUPS,
  SETTINGS_GROUPS,
  getGroupResetPatch,
  isPatchSatisfied,
} from './settingsGroups';

describe('settings group registry', () => {
  it('关于组排在导航最后，且没有可恢复的默认值', () => {
    expect(SETTINGS_GROUPS.at(-1)?.id).toBe('about');
    expect(RESETTABLE_GROUPS.has('about')).toBe(false);
    expect(getGroupResetPatch('about')).toBeNull();
  });
});

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

describe('getGroupResetPatch(openMethod)', () => {
  it('restores the four open-method defaults', () => {
    expect(getGroupResetPatch('openMethod')).toEqual({
      linkOpenMethod: 'panel',
      fileOpenMethod: 'panel',
      agentLinkIntercept: false,
      agentSiteWhitelist: [],
      resetAgentSiteRules: true,
      resetAgentSiteOverrides: true,
    });
  });
});

describe('settings registry single source (Task 4)', () => {
  it('RESETTABLE_GROUPS ⊇ keys(GROUP_RESET_PATCHES)，差集恰为自有流程六组', () => {
    const factoryKeys = new Set(Object.keys(GROUP_RESET_PATCHES));
    for (const key of factoryKeys) {
      expect(RESETTABLE_GROUPS.has(key as SettingsGroupId)).toBe(true);
    }
    const diff = [...RESETTABLE_GROUPS].filter((group) => !factoryKeys.has(group));
    expect(new Set(diff)).toEqual(
      new Set(['storage', 'browser', 'dsh', 'network', 'environment', 'opencode']),
    );
  });

  it('network/environment/opencode 走自有流程：getGroupResetPatch 返回 null', () => {
    expect(getGroupResetPatch('network')).toBeNull();
    expect(getGroupResetPatch('environment')).toBeNull();
    expect(getGroupResetPatch('opencode')).toBeNull();
  });
});
