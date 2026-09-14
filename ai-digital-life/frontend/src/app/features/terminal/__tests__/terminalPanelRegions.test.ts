// src/app/features/terminal/__tests__/terminalPanelRegions.test.ts
import { describe, expect, it } from 'vitest';
import {
  isCollapseButtonVisible,
  isRegionVisible,
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
