import { useCallback, useRef, useState } from 'react';
import { isTauriShell } from '@shared/env';
import { useAppStore } from '@stores/slicedStore';

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
            // 新建原生子窗口盖在最上层，通知透明桥接条重建回到最上层。
            useAppStore.getState().bumpSiblingWebviewNonce();
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
      // F-M2：先同步从池中移除（isTabInPool 立即 false、rerender、bumpPoolVersion），
      // 再 await 后端 destroy。否则"destroy 在途用户重激活 → isTabInPool 仍 true →
      // 创建被跳过 → tab 空白"的竞态。若 destroy 失败则回滚重新加入池。
      removeFromPool(tabId);
      if (isTauriShell()) {
        const bridge = window.digitalLife?.browser;
        if (bridge) {
          try {
            await bridge.destroyTab(tabId);
          } catch (e) {
            console.warn('destroyTab failed, re-adding tab to pool:', e);
            poolSetRef.current.add(tabId);
            insertionOrderRef.current = insertionOrderRef.current.filter((id) => id !== tabId);
            insertionOrderRef.current.push(tabId);
            rerender();
            bumpPoolVersion();
          }
        }
      }
    },
    [removeFromPool, rerender, bumpPoolVersion],
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
