import type { BrowserTabState } from '@stores/slices/browserSlice';

export type NewWindowTabHost = 'center' | 'panel';

/**
 * 页面内新窗口请求（`target="_blank"` / `window.open`）的落地宿主由发起标签决定：
 * 中心标签发起 → 中心新标签；面板标签发起 → 右侧面板新标签。
 *
 * 发起标签查不到时按面板处理（保持历史行为，避免把未知来源开到中心）。
 */
export function resolveNewWindowTabHost(
  sourceTabId: string,
  tabsById: Record<string, BrowserTabState>,
  tabs: BrowserTabState[],
): NewWindowTabHost {
  const source = tabsById[sourceTabId] ?? tabs.find((tab) => tab.id === sourceTabId);
  return source?.location === 'center' ? 'center' : 'panel';
}
