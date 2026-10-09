/** 中心标签条拖拽排序（B·滑动让位）的纯逻辑：无 DOM 依赖，可单测。 */

/** 拖拽进入判定的移动阈值（px）：阈值内仍视为单击选择。 */
export const CENTER_TAB_DRAG_THRESHOLD_PX = 4;
/** 边缘自动滚动触发带宽（px）与每帧步长。 */
export const CENTER_TAB_EDGE_SCROLL_ZONE_PX = 24;
export const CENTER_TAB_EDGE_SCROLL_STEP_PX = 12;

/**
 * 按拖拽中心在内容坐标中的位置，计算应插入序号。
 * siblingMidpoints 为除被拖项外各标签中点（内容坐标、升序），
 * 返回值是“去掉被拖项后的数组”中的插入下标（0..n）。
 */
export function calcDropIndex(siblingMidpoints: number[], draggedCenter: number): number {
  let index = 0;
  for (const midpoint of siblingMidpoints) {
    if (midpoint < draggedCenter) {
      index += 1;
    } else {
      break;
    }
  }
  return index;
}
