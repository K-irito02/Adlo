import type React from 'react';

export interface PopoverPositionInput {
  anchorLeft: number;
  anchorRight: number;
  anchorBottom: number;
  popoverWidth: number;
  viewportWidth: number;
  margin?: number;
}

/**
 * 计算搜索引擎设置 popover 的定位样式。
 * 当 popover 从锚点左侧向右展开会超出视口右边缘时，切换为右对齐
 * （右边缘对齐锚点右边缘），避免被应用边缘裁剪。
 */
export function computePopoverPosition({
  anchorLeft,
  anchorRight,
  anchorBottom,
  popoverWidth,
  viewportWidth,
  margin = 8,
}: PopoverPositionInput): Pick<React.CSSProperties, 'left' | 'right' | 'top'> {
  const fitsOnRight = anchorLeft + popoverWidth <= viewportWidth - margin;
  const top = Math.round(anchorBottom + 4);
  if (fitsOnRight) {
    return { left: Math.round(anchorLeft), top };
  }
  return { right: Math.round(viewportWidth - anchorRight), top };
}
