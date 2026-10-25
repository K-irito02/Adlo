import { classNames } from '@root/design-system/html';
import { useTCopy } from '@i18n/useTCopy';

export interface PreviewLoadingSkeletonProps {
  /**
   * 形态修饰符：
   * - `plain`：普通文档区（默认，撑满内容区）
   * - `paper`：docx 纸面（白底纸面扫光，与 `.adl-docx-paper` 对齐）
   */
  variant?: 'plain' | 'paper';
  /** 绝对定位覆盖整个预览根（office 预览用：铺满内容区，不受内层滚动容器内距影响） */
  overlay?: boolean;
  className?: string;
}

/**
 * 内容区加载占位（整面扫光）。
 * 用户指定：不要“多行骨架条”，要与变更面板点击变更文件时同一效果——
 * 即 `ChunkLoadingFallback` 的单层 `.skeleton`（`@keyframes skeleton-shimmer`
 * 整面扫光）。因此这里只渲染一个撑满内容区的 `.skeleton` 块，不画文本行；
 * 语义由 `role="status"` + `aria-label` 承担（读屏仍知道在加载）。
 */
export function PreviewLoadingSkeleton({
  variant = 'plain',
  overlay = false,
  className,
}: PreviewLoadingSkeletonProps) {
  const { t } = useTCopy();
  return (
    <div
      className={classNames(
        'skeleton',
        'adl-preview-loading',
        `adl-preview-loading--${variant}`,
        overlay ? 'adl-preview-loading--overlay' : undefined,
        className,
      )}
      role="status"
      aria-label={t.fileMediaLoading as string}
    />
  );
}
