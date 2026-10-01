import { isTauriShell } from '@shared/env';
import type { AvoidRect } from './tooltipPosition';

/**
 * 采集需要 tooltip 避让的 WebView2 容器矩形。
 *
 * - 仅 Tauri 桌面有效：浏览器模式是 iframe，tooltip 天然置顶，无需避让。
 * - 覆盖右侧浏览器面板主内容区（与 bounds 侧容器同源）。
 * - 零面积容器（面板收起/未挂载）自动跳过。
 *
 * 选择器耦合说明：以下选择器必须与实际传入 `setTabBounds` 的容器
 * （`BrowserContentArea` 的 `.adl-tool-primary--browser`）保持同源；
 * 重命名类名即静默失效（返回 []，tooltip 回到被盖住）。重命名容器时必须同步此处。
 */
export const TOOLTIP_AVOID_SELECTORS = ['.adl-tool-primary--browser'] as const;

export function getWebViewAvoidRects(): AvoidRect[] {
  // isTauriShell 已含 typeof window 检查；document 守卫针对无 DOM 的单测/SSR。
  if (!isTauriShell()) {
    return [];
  }
  if (typeof document === 'undefined') {
    return [];
  }
  const rects: AvoidRect[] = [];
  for (const selector of TOOLTIP_AVOID_SELECTORS) {
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
