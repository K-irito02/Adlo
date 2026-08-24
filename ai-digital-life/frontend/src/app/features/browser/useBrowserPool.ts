import { useCallback, useRef, useState } from 'react';
import { isTauriShell } from '@shared/env';

/**
 * Tracks which browser tabs have live WebViews (Tauri mode) or simulated pooled iframes.
 *
 * Architecture note:
 * - The pool is unbounded — suspension is driven by the frontend scheduler through
 *   `removeFromPool`/`destroyTabWebView`, not by a fixed-capacity LRU.
 * - Tauri mode: Rust's BrowserPool remains the source of truth for pool membership and
 *   eviction hints returned by `createForTab()`. The frontend Set stays in sync.
 * - Browser mode: there is no Rust pool; the Set mirrors membership and the iframe lifecycle
 *   is managed separately by `evictedIframeTabsRef` in BrowserPanelContent.
 */
export function useBrowserPool() {
  const poolSetRef = useRef<Set<string>>(new Set());
  const insertionOrderRef = useRef<string[]>([]);
  /** Tabs whose WebView creation is currently in flight — guards against
   *  duplicate concurrent creation for the same tab (URL canonicalization can
   *  refire the lifecycle effect before the async create completes). */
  const creatingRef = useRef<Set<string>>(new Set());
  const [, forceUpdate] = useState(0);
  const [poolVersion, setPoolVersion] = useState(0);
  const rerender = useCallback(() => forceUpdate((n) => n + 1), []);
  const bumpPoolVersion = useCallback(() => setPoolVersion((v) => v + 1), []);

  const isTabInPool = useCallback((tabId: string): boolean => {
    return poolSetRef.current.has(tabId);
  }, []);

  const createWebViewForTab = useCallback(
    async (tabId: string, _url: string, colorScheme?: 'light' | 'dark'): Promise<string | null> => {
      if (creatingRef.current.has(tabId)) {
        return null;
      }
      if (poolSetRef.current.has(tabId)) {
        return null;
      }
      creatingRef.current.add(tabId);
      let rustEvicted: string | null = null;
      try {
        if (isTauriShell()) {
          const bridge = window.digitalLife?.browser;
          if (bridge) {
            rustEvicted = await bridge.createForTab(tabId, _url, colorScheme);
          }
        }

        // Remove Rust-returned evicted tab
        if (rustEvicted) {
          poolSetRef.current.delete(rustEvicted);
          insertionOrderRef.current = insertionOrderRef.current.filter((id) => id !== rustEvicted);
        }

        // Add new tab
        poolSetRef.current.add(tabId);
        insertionOrderRef.current = insertionOrderRef.current.filter((id) => id !== tabId);
        insertionOrderRef.current.push(tabId);

        rerender();
        bumpPoolVersion();

        return rustEvicted;
      } finally {
        creatingRef.current.delete(tabId);
      }
    },
    [rerender, bumpPoolVersion],
  );

  const activateTabInPool = useCallback(async (tabId: string) => {
    if (isTauriShell()) {
      const bridge = window.digitalLife?.browser;
      if (bridge) {
        await bridge.activateTab(tabId);
      }
    }
  }, []);

  const navigateTabInPool = useCallback(async (tabId: string, url: string) => {
    if (isTauriShell()) {
      const bridge = window.digitalLife?.browser;
      if (bridge) {
        await bridge.navigateTab(tabId, url);
      }
    }
  }, []);

  const removeFromPool = useCallback(
    (tabId: string) => {
      poolSetRef.current.delete(tabId);
      insertionOrderRef.current = insertionOrderRef.current.filter((id) => id !== tabId);
      rerender();
      bumpPoolVersion();
    },
    [rerender, bumpPoolVersion],
  );

  const destroyTabWebView = useCallback(
    async (tabId: string) => {
      if (isTauriShell()) {
        const bridge = window.digitalLife?.browser;
        if (bridge) {
          await bridge.destroyTab(tabId);
        }
      }
      removeFromPool(tabId);
    },
    [removeFromPool],
  );

  return {
    poolSize: poolSetRef.current.size,
    isTabInPool,
    createWebViewForTab,
    activateTabInPool,
    navigateTabInPool,
    removeFromPool: destroyTabWebView,
    poolVersion,
  };
}
