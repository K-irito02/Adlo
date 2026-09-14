import { makePersistedWriter, readJson } from '@stores/storageHelpers';

export const TERMINAL_REGION_COLLAPSE_KEY = 'adl-terminal:region-collapse';

export type RegionCollapse = 'none' | 'history' | 'live';
export type RegionName = 'history' | 'live';

/**
 * 折叠状态按**标签**记录。
 *
 * 用三态而不是两个布尔：值域本身就排除了「两个区域都收起」这种非法组合，
 * 因此不需要额外的互斥校验，也不可能出现「两个区域都不可见」的空面板。
 */
export function toggleRegion(collapse: RegionCollapse, region: RegionName): RegionCollapse {
  return collapse === region ? 'none' : region;
}

/**
 * 面板内「收起/展开」按钮的单点决策（Task 14 接线用）。
 *
 * 与 Task 12 的 `toggleRegion` 不同：`toggleRegion` 是「点同区域还原、点异区域切换」的通用三态互转，
 * 而面板里任意时刻**只有可见区域**的按钮会被渲染。因此需要另一条规则：
 * - 两区都可见（`'none'`）→ 点这个区域，收起这个区域；
 * - 已经有区域被收起（某个区域单独可见）→ 点可见区域，还原两区都可见（`'none'`）。
 *
 * 设 `next = current === 'none' ? region : 'none'` 即可同时满足两种模式，
 * 且从「单区独显」状态也必然能回到 `'none'`（不会卡在两种 solo 之间互切）。
 */
export function nextRegionCollapse(current: RegionCollapse, region: RegionName): RegionCollapse {
  return current === 'none' ? region : 'none';
}

export function isRegionVisible(
  collapse: RegionCollapse,
  region: RegionName,
  available: boolean,
): boolean {
  if (region === 'history' && !available) {
    return false;
  }
  return collapse !== region;
}

/**
 * 「收起/展开」按钮只在**两个区域都可能显示**时出现。
 * 历史被删除后只剩实时区，按钮自然消失 —— 这正是需求里「不再显示收起/展开」的来源。
 */
export function isCollapseButtonVisible(hasHistory: boolean): boolean {
  return hasHistory;
}

const scheduleWrite = makePersistedWriter(TERMINAL_REGION_COLLAPSE_KEY);

export function normalizeRegionCollapseMap(raw: unknown): Record<string, RegionCollapse> {
  const source = (raw ?? {}) as Record<string, unknown>;
  const out: Record<string, RegionCollapse> = {};
  for (const [tabId, value] of Object.entries(source)) {
    if (value === 'none' || value === 'history' || value === 'live') {
      out[tabId] = value;
    }
  }
  return out;
}

export const terminalRegionCollapseStore = {
  load(): Record<string, RegionCollapse> {
    return normalizeRegionCollapseMap(readJson<unknown>(TERMINAL_REGION_COLLAPSE_KEY, {}));
  },
  save(map: Record<string, RegionCollapse>): void {
    scheduleWrite(map);
  },
};
