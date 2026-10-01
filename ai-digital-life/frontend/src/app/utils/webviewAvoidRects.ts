import { isTauriShell } from '@shared/env';
import type { AvoidRect } from './tooltipPosition';

/**
 * 采集需要 tooltip 避让的 WebView2 容器矩形。
 *
 * - 仅 Tauri 桌面有效：浏览器模式是 iframe，tooltip 天然置顶，无需避让。
 * - 覆盖中间区 dsh 宿主容器与右侧浏览器面板主内容区（与各自 bounds 侧容器同源）。
 * - 零面积容器（面板收起/未挂载）自动跳过。
 */
const AVOID_SELECTORS = [
  '#dsh-host-region[data-shell="tauri"]',
  '.adl-tool-primary--browser',
] as const;

export function getWebViewAvoidRects(): AvoidRect[] {
  if (!isTauriShell()) {
    return [];
  }
  if (typeof document === 'undefined') {
    return [];
  }
  const rects: AvoidRect[] = [];
  for (const selector of AVOID_SELECTORS) {
    const elements = document.querySelectorAll(selector);
    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        continue;
      }
      rects.push({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom });
    }
  }
  return rects;
}
