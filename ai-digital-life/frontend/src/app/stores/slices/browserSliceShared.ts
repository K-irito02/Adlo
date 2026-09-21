import type { BrowserTabState, BrowserTabStateUpdate } from './browserTypes';

export type { BrowserTabState, BrowserTabStateUpdate };
export type { BookmarkTabItem, TabFolderState, TabFolderStateUpdate } from './browserFoldersTypes';

/**
 * Browser storage key constants.
 *
 * Task 9 迁移完成后，浏览器面板的持久化键（`adl:browser.*`）全部登记在
 * `persisted/registry.ts` 中，写盘走 `persist()` / `persistField()`、读取走
 * `hydrateAll()` —— 因此这些键不再以本地常量形式存在（单一事实来源是登记表）。
 */

/** Default list of ports to scan for local development servers. */
export const DEFAULT_CONFIGURED_PORTS = [
  3000, 3001, 3080, 4173, 5000, 5173, 8080, 8000, 4200, 9000, 9229, 2718,
];

/**
 * 每标签缩放边界（Task 24）：写侧 clamp 与读侧钳制同源（Task 10 R1 教训 ——
 * 读界不得比写侧宽）。parsers 的 readZoomByTab 引用同一对常量。
 */
export const BROWSER_ZOOM_MIN = 0.5;
export const BROWSER_ZOOM_MAX = 2.0;
export const DEFAULT_BROWSER_ZOOM = 1.0;
