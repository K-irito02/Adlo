import type { BrowserTabState, BrowserTabStateUpdate } from './browserTypes';

export type { BrowserTabState, BrowserTabStateUpdate };
export type { BookmarkTabItem, TabFolderState, TabFolderStateUpdate } from './browserFoldersTypes';

/**
 * Browser storage key constants.
 *
 * Task 9 迁移完成后，浏览器面板的持久化键（`adl:browser.*`）全部登记在
 * `persisted/registry.ts` 中，写盘走 `persist()` / `persistField()`、读取走
 * `hydrateAll()` —— 因此这些键不再以本地常量形式存在（单一事实来源是登记表）。
 *
 * 仅保留一个尚未迁移的遗留键：死状态 `browser-workspace-expanded`（无消费者，
 * Task 20 删除），其字面量与写盘通道暂时保留，并由 PERSIST_KEEP_KEYS 保护。
 */
export const BROWSER_WORKSPACE_EXPANDED_KEY = 'adl-ui:browser-workspace-expanded';

/** Default list of ports to scan for local development servers. */
export const DEFAULT_CONFIGURED_PORTS = [
  3000, 3001, 3080, 4173, 5000, 5173, 8080, 8000, 4200, 9000, 9229, 2718,
];
