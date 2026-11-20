/** 图片/视频缩放口径（Q8，用户已确认）：独立模块便于组件与测试共享，不破坏 fast-refresh。 */

/** 缩放上下限：10%–800%。 */
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 8;
/** 胶囊按钮每档 ×1.25；滚轮每档 ×1.1。 */
export const ZOOM_STEP_BUTTON = 1.25;
export const ZOOM_STEP_WHEEL = 1.1;

export function clampZoom(value: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
}
