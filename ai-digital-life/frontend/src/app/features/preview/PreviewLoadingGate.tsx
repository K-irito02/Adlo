import { PreviewLoadingSkeleton, type PreviewLoadingSkeletonProps } from './PreviewLoadingSkeleton';
import {
  type LoadingVisibilityOptions,
  useDelayedLoadingVisible,
} from './useDelayedLoadingVisible';

export type PreviewLoadingGateProps = LoadingVisibilityOptions & {
  active: boolean;
} & PreviewLoadingSkeletonProps;

/** 按“延迟 + 最短展示”策略渲染扫光占位；未到显现时机时返回 null。 */
export function PreviewLoadingGate({
  active,
  delayMs,
  minVisibleMs,
  ...skeletonProps
}: PreviewLoadingGateProps) {
  const visible = useDelayedLoadingVisible(active, { delayMs, minVisibleMs });
  return visible ? <PreviewLoadingSkeleton {...skeletonProps} /> : null;
}
