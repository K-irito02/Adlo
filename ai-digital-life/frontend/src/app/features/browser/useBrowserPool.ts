import { useCallback, useRef, useState } from 'react';
import { isTauriShell } from '@shared/env';

const POOL_CAPACITY = 6;

/**
 * Tracks which browser tabs have live WebViews (Tauri mode) or simulated pooled iframes.
 *
 * Architecture note:
 * - Tauri mode: Rust's BrowserPool is the single source of truth for pool membership and LRU eviction.
 *   The frontend Set is a read-heavy cache for `isTabInPool()` checks (used by tab fading UI).
 *   It stays in sync by reacting to eviction hints returned by `createForTab()`.
 * - Browser mode: there is no Rust pool. The Set still enforces capacity (LRU via insertion order)
 *   to stay consistent with Tauri-mode behavior. Actual iframe lifecycle is managed separately
 *   by `evictedIframeTabsRef` in BrowserPanelContent.
 */
export function useBrowserPool() {
  const poolSetRef = useRef<Set<string>>(new Set());
  const insertionOrderRef = useRef<string[]>([]);
  /** Tabs exempt from LRU eviction (pinned / playing audio), browser-mode parity. */
  const protectedRef = useRef<Set<string>>(new Set());
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

  /** Evict the oldest NON-protected entry from the local Set (browser-mode parity). */
  const evictLocalLRU = useCallback(() => {
    while (
      insertionOrderRef.current.length > POOL_CAPACITY &&
      insertionOrderRef.current.some((id) => !protectedRef.current.has(id))
    ) {
      const evictIdx = insertionOrderRef.current.findIndex((id) => !protectedRef.current.has(id));
      if (evictIdx < 0) {
        break;
      }
      const [oldest] = insertionOrderRef.current.splice(evictIdx, 1);
      poolSetRef.current.delete(oldest);
      console.info('[ADL-DEBUG][browser] local LRU evicted tab', {
        tabId: oldest,
        poolSize: poolSetRef.current.size,
      });
    }
  }, []);

  const createWebViewForTab = useCallback(
    async (tabId: string, _url: string, colorScheme?: 'light' | 'dark'): Promise<string | null> => {
      if (creatingRef.current.has(tabId)) {
        console.info('[ADL-DEBUG][browser] createWebViewForTab SKIP in-flight', { tabId });
        return null;
      }
      if (poolSetRef.current.has(tabId)) {
        return null;
      }
      creatingRef.current.add(tabId);
      let rustEvicted: string | null = null;
      try {
        console.info('[ADL-DEBUG][browser] createWebViewForTab ENTER', {
          tabId,
          url: _url,
          poolSizeBefore: poolSetRef.current.size,
        });

        if (isTauriShell()) {
          const bridge = window.digitalLife?.browser;
          if (bridge) {
            rustEvicted = await bridge.createForTab(tabId, _url, colorScheme);
          }
        }

        // Remove evicted (Rust-returned or local-LRU)
        if (rustEvicted) {
          poolSetRef.current.delete(rustEvicted);
          insertionOrderRef.current = insertionOrderRef.current.filter((id) => id !== rustEvicted);
          console.info('[ADL-DEBUG][browser] tab evicted from WebView pool', {
            evictedTabId: rustEvicted,
            newTabId: tabId,
          });
        }

        // Add new tab
        poolSetRef.current.add(tabId);
        insertionOrderRef.current = insertionOrderRef.current.filter((id) => id !== tabId);
        insertionOrderRef.current.push(tabId);

        // Enforce capacity locally (relevant in browser mode without Rust pool)
        if (!isTauriShell()) {
          evictLocalLRU();
        }

        rerender();
        bumpPoolVersion();

        return rustEvicted;
      } finally {
        creatingRef.current.delete(tabId);
      }
    },
    [rerender, bumpPoolVersion, evictLocalLRU],
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

  const setTabProtected = useCallback((tabId: string, isProtected: boolean) => {
    if (isProtected) {
      protectedRef.current.add(tabId);
    } else {
      protectedRef.current.delete(tabId);
    }
  }, []);

  const removeFromPool = useCallback(
    (tabId: string) => {
      poolSetRef.current.delete(tabId);
      insertionOrderRef.current = insertionOrderRef.current.filter((id) => id !== tabId);
      protectedRef.current.delete(tabId);
      rerender();
      bumpPoolVersion();
    },
    [rerender, bumpPoolVersion],
  );

  const destroyTabWebView = useCallback(
    async (tabId: string) => {
      console.info('[ADL-DEBUG][browser] destroyTabWebView', { tabId });
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
    setTabProtected,
    removeFromPool: destroyTabWebView,
    poolVersion,
  };
}
