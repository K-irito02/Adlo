/**
 * 活动列表工具函数
 * 用于管理会话活动和 run 数据的修剪逻辑
 */

import type { DigitalLifeRunActivityEventV1, ModelTokenUsage } from '@ai-digital-life/kernel';

// 常量配置
export const MAX_ACTIVITY_PER_RUN = 500;
export const MIN_ACTIVITY_RETAIN = 400;
export const MAX_STORED_RUNS = 50;

/**
 * 修剪单个 run 的活动列表，保留最新的条目
 * @param activities 活动列表
 * @returns 修剪后的活动列表
 */
export function trimActivityList(
  activities: DigitalLifeRunActivityEventV1[],
): DigitalLifeRunActivityEventV1[] {
  if (activities.length <= MAX_ACTIVITY_PER_RUN) {
    return activities;
  }
  return activities.slice(-MIN_ACTIVITY_RETAIN);
}

/** Sum the total cost (USD) across run usages. */
export function sumUsageCost(usages: (ModelTokenUsage | undefined)[]): number {
  return usages.reduce((acc, u) => acc + (u?.cost?.totalCost ?? 0), 0);
}

/**
 * 修剪旧的 runs，保留最近访问的
 * @param activityMap runId 到活动列表的映射
 * @param usageMap runId 到 token 使用的映射
 * @param accessMap runId 到最后访问时间的映射
 * @param excludeRunIds 需要保留的 runId 集合（如当前正在流式输出的）
 * @returns 修剪后的映射
 */
export function trimOldRuns(
  activityMap: Record<string, DigitalLifeRunActivityEventV1[]>,
  usageMap: Record<string, ModelTokenUsage | undefined>,
  accessMap: Record<string, number>,
  excludeRunIds: Set<string>,
): {
  runActivityByRunId: Record<string, DigitalLifeRunActivityEventV1[]>;
  runUsageByRunId: Record<string, ModelTokenUsage | undefined>;
  _runLastAccessTime: Record<string, number>;
} {
  const runIds = Object.keys(activityMap);
  if (runIds.length <= MAX_STORED_RUNS) {
    return {
      runActivityByRunId: activityMap,
      runUsageByRunId: usageMap,
      _runLastAccessTime: accessMap,
    };
  }

  const sortedRunIds = runIds
    .filter((id) => !excludeRunIds.has(id))
    .sort((a, b) => (accessMap[a] ?? 0) - (accessMap[b] ?? 0));

  const toRemove = sortedRunIds.slice(
    0,
    sortedRunIds.length - MAX_STORED_RUNS + excludeRunIds.size,
  );
  const toRemoveSet = new Set(toRemove);

  const nextActivity: Record<string, DigitalLifeRunActivityEventV1[]> = {};
  const nextUsage: Record<string, ModelTokenUsage | undefined> = {};
  const nextAccess: Record<string, number> = {};

  for (const id of runIds) {
    if (!toRemoveSet.has(id)) {
      nextActivity[id] = activityMap[id];
      if (id in usageMap) {
        nextUsage[id] = usageMap[id];
      }
      nextAccess[id] = accessMap[id] ?? Date.now();
    }
  }

  return {
    runActivityByRunId: nextActivity,
    runUsageByRunId: nextUsage,
    _runLastAccessTime: nextAccess,
  };
}
