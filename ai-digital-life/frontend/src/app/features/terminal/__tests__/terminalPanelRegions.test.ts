// src/app/features/terminal/__tests__/terminalPanelRegions.test.ts
import { describe, expect, it } from 'vitest';
import {
  isCollapseButtonVisible,
  isRegionVisible,
  nextRegionCollapse,
  type RegionCollapse,
} from '../terminalRegionCollapse';

/**
 * 两个区域的可见性组合（走**真实产品路径** `nextRegionCollapse`）。
 * `RegionCollapse` 存的始终是「**被隐藏的**区域」；面板/中心任意时刻只渲染可见区域的按钮。
 */
describe('两个区域的可见性组合（nextRegionCollapse 驱动）', () => {
  it('两区都可见时点历史区 → 历史区铺满、实时区不可见，按钮仍显示', () => {
    const collapse = nextRegionCollapse('none', 'history');
    expect(collapse).toBe('live');
    expect(isRegionVisible(collapse, 'history', true)).toBe(true);
    expect(isRegionVisible(collapse, 'live', true)).toBe(false);
    expect(isCollapseButtonVisible(true)).toBe(true);
  });

  it('已最大化时点可见区 → 还原两区都可见', () => {
    expect(nextRegionCollapse('live', 'history')).toBe('none');
    expect(nextRegionCollapse('history', 'live')).toBe('none');
  });

  it('历史不存在时该按钮不显示；实时区始终可见（消费点另有渲染期归一化兜底）', () => {
    expect(isCollapseButtonVisible(false)).toBe(false);
    expect(isRegionVisible('none', 'live', true)).toBe(true);
    // 历史不可用时历史区恒不可见，与折叠态无关
    expect(isRegionVisible('none', 'history', false)).toBe(false);
  });

  it('每个标签的折叠状态互不影响（键为 tabId 的整表）', () => {
    const map: Record<string, RegionCollapse> = {
      tabA: nextRegionCollapse('none', 'history'),
      tabB: nextRegionCollapse('none', 'live'),
    };
    expect(map.tabA).toBe('live');
    expect(map.tabB).toBe('history');
  });

  it('三态值域天然保证不可能两个区域都收起', () => {
    for (const state of ['none', 'history', 'live'] as const) {
      for (const region of ['history', 'live'] as const) {
        expect(['none', 'history', 'live']).toContain(nextRegionCollapse(state, region));
      }
    }
  });
});

/**
 * 按钮的单点决策：两区可见时点某区＝最大化该区（隐藏另一区）；某区已独显时点该可见区＝还原两区。
 * 注意这**不是**「点同区域还原、点异区域切换」的通用三态互转。
 */
describe('区域最大化/还原按钮的单点决策（nextRegionCollapse）', () => {
  it('两区都可见时点历史区 → 最大化历史区（收起实时区）', () => {
    expect(nextRegionCollapse('none', 'history')).toBe('live');
    expect(isRegionVisible('live', 'history', true)).toBe(true);
    expect(isRegionVisible('live', 'live', true)).toBe(false);
  });

  it('两区都可见时点实时区 → 最大化实时区（收起历史区）', () => {
    expect(nextRegionCollapse('none', 'live')).toBe('history');
    expect(isRegionVisible('history', 'live', true)).toBe(true);
    expect(isRegionVisible('history', 'history', true)).toBe(false);
  });

  it('历史区独显时点实时区（可见区）→ 还原两区都可见', () => {
    expect(nextRegionCollapse('history', 'live')).toBe('none');
  });

  it('实时区独显时点历史区（可见区）→ 还原两区都可见', () => {
    expect(nextRegionCollapse('live', 'history')).toBe('none');
  });

  it('从独显状态必然能回到 none（不会卡在两种 solo 互切）', () => {
    // 历史独显（= live 被隐藏）点历史区 → none；再点历史区 → live（最大化历史）。单点按钮即可来回切换。
    expect(nextRegionCollapse('history', 'history')).toBe('none');
    expect(nextRegionCollapse('none', 'history')).toBe('live');
  });
});
