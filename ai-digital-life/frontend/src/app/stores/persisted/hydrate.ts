import type { StoreState } from '../StoreState';
import { readJson } from '../storageHelpers';
import { registryEntries } from './registry';
import { compositeHydrators } from './composite';

export type HydrationResult = {
  /** 直接可交给 useAppStore.setState 的初始状态补丁 */
  patch: Partial<StoreState>;
  /** 解析失败或形状不合法、需要在本轮启动中被覆盖的键 */
  dirtyKeys: string[];
};

let cached: HydrationResult | undefined;

/**
 * 键存在性探测：只看"写过没有"，不做解析。
 *
 * readJson 对"从未写过""JSON 解析失败""storage 不可用"三种情况都返回 fallback，
 * 三者无法区分；而"写过但解析失败"必须计入 dirtyKeys，才能在本轮启动被覆盖。
 * 探测本身同样做异常兜底（storage 被禁用时视为不存在）。
 */
function hasStoredValue(key: string): boolean {
  try {
    return window.localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

/**
 * store 构造期同步执行一次的水合。
 *
 * 设计要点（规格 §3.3）：
 * - 全应用只有这一个水合时机，且是同步的 → 不存在"未水合即写盘"的竞态窗口，
 *   因此不需要 hydrated 守卫标志。
 * - 本函数**不做引用类剪枝**（工作区/目录/标签的存在性剪枝由 prune.ts 的四个
 *   入口在参照清单就绪后分别触发）。原因见规格 §3.5.1 首要安全规则。
 * - 单条读取失败只影响该条，整体降级为 fallback，绝不抛错、绝不阻塞启动。
 */
export function hydrateAll(): HydrationResult {
  if (cached) {
    return cached;
  }
  const patch: Record<string, unknown> = {};
  const dirtyKeys: string[] = [];

  for (const entry of registryEntries) {
    if (entry.sync === false) {
      continue;
    }
    if (!hasStoredValue(entry.key)) {
      patch[entry.field as string] = entry.fallback;
      continue;
    }
    const raw = readJson<unknown>(entry.key, undefined);
    if (raw === undefined) {
      // 键存在却读不出值 ⇒ 存储内容已损坏，必须在本轮启动被覆盖
      patch[entry.field as string] = entry.fallback;
      dirtyKeys.push(entry.key);
      continue;
    }
    if (!entry.read) {
      patch[entry.field as string] = raw;
      continue;
    }
    const parsed = entry.read(raw);
    if (parsed === undefined) {
      patch[entry.field as string] = entry.fallback;
      dirtyKeys.push(entry.key);
      continue;
    }
    patch[entry.field as string] = parsed;
  }

  // 跨键归一化：必须在全部简单条目读完之后应用 —— 归一化器的输入是「多个键的共同结果」
  // （例如 browserTabs 的 titleResolved 结算需要 tabs 本体，tabId→URL 映射需要书签 + 文件夹 + 标签）。
  // 直接读原始值（不经过登记表的 read 校验器），因此归一化器自身必须对坏形状完全防御。
  for (const hydrator of compositeHydrators) {
    Object.assign(
      patch,
      hydrator.build((key) => readJson<unknown>(key, undefined)),
    );
  }

  cached = { patch: patch as Partial<StoreState>, dirtyKeys };
  return cached;
}

/** 仅供测试重置模块级缓存 */
export function resetHydrationForTest(): void {
  cached = undefined;
}
