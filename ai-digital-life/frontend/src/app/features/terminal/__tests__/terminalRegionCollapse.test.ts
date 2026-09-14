import { describe, expect, it } from 'vitest';
import {
  isCollapseButtonVisible,
  isRegionVisible,
  normalizeRegionCollapseMap,
  toggleRegion,
} from '../terminalRegionCollapse';

describe('toggleRegion', () => {
  it('两个区域都展开时收起指定区域', () => {
    expect(toggleRegion('none', 'history')).toBe('history');
    expect(toggleRegion('none', 'live')).toBe('live');
  });

  it('已收起某区域时再次点击即展开', () => {
    expect(toggleRegion('history', 'history')).toBe('none');
    expect(toggleRegion('live', 'live')).toBe('none');
  });

  it('三态值域天然保证不可能两个都收起', () => {
    for (const state of ['none', 'history', 'live'] as const) {
      for (const region of ['history', 'live'] as const) {
        expect(['none', 'history', 'live']).toContain(toggleRegion(state, region));
      }
    }
  });
});

describe('isRegionVisible', () => {
  it('被收起的区域不可见，另一个区域永远可见', () => {
    expect(isRegionVisible('history', 'history', true)).toBe(false);
    expect(isRegionVisible('history', 'live', true)).toBe(true);
    expect(isRegionVisible('live', 'live', true)).toBe(false);
    expect(isRegionVisible('live', 'history', true)).toBe(true);
  });

  it('历史不可用时历史区始终不可见', () => {
    expect(isRegionVisible('none', 'history', false)).toBe(false);
  });
});

describe('isCollapseButtonVisible', () => {
  it('只有两个区域都可能显示时才出现收起/展开按钮', () => {
    expect(isCollapseButtonVisible(true)).toBe(true);
    expect(isCollapseButtonVisible(false)).toBe(false);
  });
});

describe('normalizeRegionCollapseMap', () => {
  it('丢弃非法值与非法标签键', () => {
    expect(normalizeRegionCollapseMap({ t1: 'history', t2: 'nope', t3: 1 })).toEqual({
      t1: 'history',
    });
    expect(normalizeRegionCollapseMap(null)).toEqual({});
  });
});
