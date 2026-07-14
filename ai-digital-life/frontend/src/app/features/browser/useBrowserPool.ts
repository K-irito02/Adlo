import { useCallback, useRef, useState } from 'react';
import { isTauriShell } from '@tauri-bridge';

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
  const [, forceUpdate] = useState(0);
  const [poolVersion, setPoolVersion] = useState(0);
  const rerender = useCallback(() => forceUpdate((n) => n + 1), []);
  const bumpPoolVersion = useCallback(() => setPoolVersion((v) => v + 1), []);

  const isTabInPool = useCallback((tabId: string): boolean => {
    return poolSetRef.current.has(tabId);
  }, []);

  /** Evict the oldest entry from the local Set (browser-mode fallback when over capacity). */
  const evictLocalLRU = useCallback(() => {
    while (insertionOrderRef.current.length > POOL_CAPACITY) {
      const oldest = insertionOrderRef.current.shift();
      if (oldest) {
        poolSetRef.current.delete(oldest);
      }
    }
  }, []);

  const createWebViewForTab = useCallback(
    async (tabId: string, _url: string, colorScheme?: 'light' | 'dark'): Promise<string | null> => {
      let rustEvicted: string | null = null;

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
    },
    [rerender, bumpPoolVersion, evictLocalLRU]
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
    [rerender, bumpPoolVersion]
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
    [removeFromPool]
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
