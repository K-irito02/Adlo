import { useCallback, useRef, useState } from 'react';
import { isTauriShell } from '../../../tauri-bridge';

export function useBrowserPool(_maxPoolSize?: number) {
  const poolSetRef = useRef<Set<string>>(new Set());
  const [, forceUpdate] = useState(0);
  const [poolVersion, setPoolVersion] = useState(0);
  const rerender = useCallback(() => forceUpdate((n) => n + 1), []);
  const bumpPoolVersion = useCallback(() => setPoolVersion((v) => v + 1), []);

  const isTabInPool = useCallback((tabId: string): boolean => {
    return poolSetRef.current.has(tabId);
  }, []);

  const createWebViewForTab = useCallback(
    async (tabId: string, url: string): Promise<string | null> => {
      let rustEvicted: string | null = null;

      if (isTauriShell()) {
        const bridge = window.digitalLife?.browser;
        if (bridge) {
          rustEvicted = await bridge.createForTab(tabId, url);
        }
      }

      if (rustEvicted) {
        poolSetRef.current.delete(rustEvicted);
      }

      poolSetRef.current.add(tabId);
      rerender();
      bumpPoolVersion();

      return rustEvicted;
    },
    [rerender, bumpPoolVersion]
  );

  const activateTabInPool = useCallback(async (tabId: string) => {
    if (isTauriShell()) {
      const bridge = window.digitalLife?.browser;
      if (bridge) {
        await bridge.activateTab(tabId);
      }
    }
  }, []);

  const removeFromPool = useCallback(
    (tabId: string) => {
      poolSetRef.current.delete(tabId);
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
    removeFromPool: destroyTabWebView,
    poolVersion,
  };
}
