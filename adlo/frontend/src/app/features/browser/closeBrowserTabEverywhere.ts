import { useAppStore } from '@stores/slicedStore';
import { browserPool } from './browserPoolSingleton';

/**
 * 关闭浏览器标签：同时回收中心标签条条目与共享 WebView 池。
 *
 * `browserCloseTab` 只删 store 状态（面板路径另有 wrapper 回收池条目）；中心路径由
 * `CenterTabStrip` 负责。下载触发的空标签自动关闭必须覆盖两个宿主，故收敛到此处。
 */
export function closeBrowserTabEverywhere(tabId: string): void {
  const state = useAppStore.getState();
  const centerTab = state.centerTabs.find((tab) => tab.kind === 'browser' && tab.refId === tabId);
  state.browserCloseTab(tabId);
  if (centerTab) {
    state.centerRemoveTab(centerTab.id);
  }
  void browserPool.destroyTab(tabId).catch((e) => {
    console.warn('[browser] destroyTab on auto-close failed:', e);
  });
}
