import { readJson } from '@stores/storageHelpers';
import { persist } from '@stores/persisted/persist';

export const TERMINAL_REGION_COLLAPSE_KEY = 'adl:terminal.regionCollapse';

export type RegionCollapse = 'none' | 'history' | 'live';
export type RegionName = 'history' | 'live';

// 折叠态按**标签**记录，且存的始终是「**被隐藏的**区域」。用三态而不是两个布尔：值域本身
// 就排除了「两个区域都收起」这种非法组合，因此不需要额外的互斥校验。
// 唯一的切换入口是下方的 `nextRegionCollapse` —— 不要再引入语义相反的第二套「折叠」切换，
// 否则同模块并存两套相反语义极易误用。
//
// 注意：`(hasHistory=false, collapse='live')` 是**唯一**会两区皆不可见的组合。历史被删除时
// `deleteHistory` 会把折叠态复位为 'none'；重启时历史索引惰性加载期间 `hasHistory` 短暂为
// false，故消费点（TerminalPanel / CenterTerminalView）另做渲染期归一化兜底。

/**
 * 「最大化 / 还原」按钮的单点决策（面板与中心共用）。
 *
 * 语义以**用户视角**定义（`RegionCollapse` 存的始终是「被隐藏的区域」）：
 * - 两区都可见（`'none'`）→ 点某区 = **最大化该区**：把**另一个区域**收起来给它让位，
 *   于是该区域铺满、完全覆盖另一区；
 * - 已有区域被收起（某区独显）→ 点该可见区 = **还原**：两区都可见（`'none'`）。
 *
 * 因此两区可见时返回的是传入区域的**对立区域**（不是传入区域本身）。
 * 面板里任意时刻只有可见区域的按钮被渲染，故从「单区独显」必然能回到 `'none'`，
 * 不会卡在两种 solo 之间互切。
 */
export function nextRegionCollapse(current: RegionCollapse, region: RegionName): RegionCollapse {
  if (current !== 'none') {
    return 'none';
  }
  return region === 'history' ? 'live' : 'history';
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
 * 「最大化/还原」按钮只在**两个区域都可能显示**时出现。
 * 历史被删除后只剩实时区，按钮自然消失 —— 这正是需求里「不再显示该按钮」的来源。
 */
export function isCollapseButtonVisible(hasHistory: boolean): boolean {
  return hasHistory;
}

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

// 模块级缓存：构造期水合（persisted/registry 的 apply 汇聚器）填值，之后 load 直接返回缓存。
// cacheSet 防御：构造期 apply 未运行（测试路径 / 提前调用）时，按需读一次存储避免返回错误空值。
let cache: Record<string, RegionCollapse> = {};
let cacheSet = false;

export const terminalRegionCollapseStore = {
  load(): Record<string, RegionCollapse> {
    if (!cacheSet) {
      cache = normalizeRegionCollapseMap(readJson<unknown>(TERMINAL_REGION_COLLAPSE_KEY, {}));
      cacheSet = true;
    }
    return cache;
  },
  save(map: Record<string, RegionCollapse>): void {
    cache = map;
    cacheSet = true;
    persist(TERMINAL_REGION_COLLAPSE_KEY, map);
  },
  /** 构造期水合：把校验+剪枝后的值交回模块缓存 */
  apply(value: Record<string, RegionCollapse>): void {
    cache = value;
    cacheSet = true;
  },
};
