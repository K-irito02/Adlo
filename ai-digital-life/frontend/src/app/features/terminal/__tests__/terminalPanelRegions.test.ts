// src/app/features/terminal/__tests__/terminalPanelRegions.test.ts
import { describe, expect, it } from 'vitest';
import {
  isCollapseButtonVisible,
  isRegionVisible,
  nextRegionCollapse,
  toggleRegion,
} from '../terminalRegionCollapse';

describe('两个区域的可见性组合（需求逐条对应）', () => {
  it('收起历史后历史区不可见、实时区铺满，收起按钮仍显示', () => {
    const collapse = toggleRegion('none', 'history');
    expect(collapse).toBe('history');
    expect(isRegionVisible(collapse, 'history', true)).toBe(false);
    expect(isRegionVisible(collapse, 'live', true)).toBe(true);
    expect(isCollapseButtonVisible(true)).toBe(true);
  });

  it('点常驻「展开」后两区都可见', () => {
    expect(toggleRegion('history', 'history')).toBe('none');
  });

  it('删除历史后实时区恢复展开，且不再显示收起/展开按钮', () => {
    // 删除历史时折叠状态复位（见 useTerminalPanel.deleteHistory）
    const reset = toggleRegion('live', 'live');
    expect(reset).toBe('none');
    expect(isRegionVisible(reset, 'live', true)).toBe(true);
    expect(isCollapseButtonVisible(false)).toBe(false);
  });

  it('每个标签的折叠状态互不影响', () => {
    const map: Record<string, ReturnType<typeof toggleRegion>> = {
      tabA: toggleRegion('none', 'history'),
      tabB: toggleRegion('none', 'live'),
    };
    expect(map.tabA).toBe('history');
    expect(map.tabB).toBe('live');
  });
});

/**
 * 「最大化 / 还原」按钮的单点决策（面板与中心共用）。
 * `RegionCollapse` 存的始终是**被隐藏的区域**：两区可见时点某区＝最大化该区（隐藏另一区）；
 * 某区已独显时点该可见区＝还原两区。注意这与 Task 12 的 `toggleRegion` 语义不同
 * （后者是通用三态互转），面板里任意时刻只渲染可见区域的按钮，故必然能回到 `'none'`。
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
    // 历史独显点历史区 → none；再点历史区 → live（最大化历史）。单点按钮即可来回切换。
    expect(nextRegionCollapse('history', 'history')).toBe('none');
    expect(nextRegionCollapse('none', 'history')).toBe('live');
  });
});
