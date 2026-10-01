import { useSyncExternalStore } from 'react';
import { browserPool } from './browserPoolSingleton';

/**
 * Thin hook wrapper over the shared `browserPool` module singleton.
 *
 * Both browser hosts (right panel + center) delegate to the same pool, so a tab
 * created by one host is immediately visible to the other. `useSyncExternalStore`
 * subscribes this component to the singleton's version counter.
 *
 * Architecture note:
 * - The pool is unbounded — suspension is driven by the frontend scheduler through
 *   `removeFromPool`/`destroyTab`, not by a fixed-capacity LRU.
 * - Tauri mode: Rust's BrowserPool remains the source of truth for pool membership and
 *   eviction hints returned by `createForTab()`. The frontend Set stays in sync.
 * - Browser mode: there is no Rust pool; the Set mirrors membership and the iframe lifecycle
 *   is managed separately by `evictedIframeTabsRef` in BrowserPanelContent.
 */
export function useBrowserPool() {
  const poolVersion = useSyncExternalStore(browserPool.subscribe, browserPool.getVersion);

  return {
    poolSize: browserPool.getSize(),
    isTabInPool: browserPool.isTabInPool,
    createWebViewForTab: browserPool.createForTab,
    activateTabInPool: browserPool.activateTab,
    navigateTabInPool: browserPool.navigateTab,
    removeFromPool: browserPool.destroyTab,
    poolVersion,
  };
}
