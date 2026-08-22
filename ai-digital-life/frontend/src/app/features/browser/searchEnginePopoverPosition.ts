import type { CSSProperties } from 'react';

export interface PopoverPositionInput {
  anchorLeft: number;
  anchorRight: number;
  anchorBottom: number;
  popoverWidth: number;
  viewportWidth: number;
  margin?: number;
}

const VIEWPORT_MARGIN = 8;
const VERTICAL_GAP = 4;

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
  margin = VIEWPORT_MARGIN,
}: PopoverPositionInput): Pick<CSSProperties, 'left' | 'right' | 'top'> {
  const fitsOnRight = anchorLeft + popoverWidth <= viewportWidth - margin;
  const top = Math.round(anchorBottom + VERTICAL_GAP);
  if (fitsOnRight) {
    return { left: Math.round(anchorLeft), top };
  }
  // 右对齐：右边缘对齐锚点右边缘；右对齐后若左边缘会溢出视口左侧，回退为从视口左边缘留边距
  const rightAlignedLeft = anchorRight - popoverWidth;
  if (rightAlignedLeft >= margin) {
    return { right: Math.round(viewportWidth - anchorRight), top };
  }
  return { left: margin, top };
}
