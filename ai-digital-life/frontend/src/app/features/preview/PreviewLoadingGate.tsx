import { useState } from 'react';
import { PreviewLoadingSkeleton, type PreviewLoadingSkeletonProps } from './PreviewLoadingSkeleton';
import {
  type LoadingVisibilityOptions,
  remainingLoadingDelayMs,
  useDelayedLoadingVisible,
} from './useDelayedLoadingVisible';

export type PreviewLoadingGateProps = LoadingVisibilityOptions & {
  active: boolean;
  /**
   * 这次「打开文件」的起始时间戳（绝对时间，不是剩余延迟）。
   * 组件在挂载时用 `remainingLoadingDelayMs(startedAt)` 快照一次，
   * 使读取 → chunk → 渲染三个阶段共享同一份 150ms 预算。
   */
  startedAt?: number | null;
} & PreviewLoadingSkeletonProps;

/** 按“延迟 + 最短展示”策略渲染扫光占位；未到显现时机时返回 null。 */
export function PreviewLoadingGate({
  active,
  delayMs,
  minVisibleMs,
  startedAt,
  ...skeletonProps
}: PreviewLoadingGateProps) {
  // 只取首次挂载时的剩余预算：后续渲染（Date.now 变化）不得重置延迟计时。
  const [initialDelayMs] = useState(() => remainingLoadingDelayMs(startedAt ?? null));
  const visible = useDelayedLoadingVisible(active, {
    delayMs: delayMs ?? initialDelayMs,
    minVisibleMs,
  });
  return visible ? <PreviewLoadingSkeleton {...skeletonProps} /> : null;
}
