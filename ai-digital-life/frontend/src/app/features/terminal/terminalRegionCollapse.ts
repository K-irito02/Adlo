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
