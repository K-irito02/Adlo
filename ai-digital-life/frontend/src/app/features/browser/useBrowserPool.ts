import { useCallback, useRef, useState } from 'react';
import { isTauriShell } from '../../../tauri-bridge';

export function useBrowserPool(maxPoolSize: number = 6) {
  const lruOrderRef = useRef<string[]>([]);
  const poolRef = useRef<Map<string, { tabId: string }>>(new Map());
  const [, forceUpdate] = useState(0);
  const [poolVersion, setPoolVersion] = useState(0);
  const rerender = useCallback(() => forceUpdate((n) => n + 1), []);
  const bumpPoolVersion = useCallback(() => setPoolVersion((v) => v + 1), []);

  const isTabInPool = useCallback((tabId: string): boolean => {
    return poolRef.current.has(tabId);
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

      console.log(
        '[ADL-DEBUG] [BrowserPool] createWebViewForTab',
        'tabId:',
        tabId,
        'url:',
        url,
        'rustEvicted:',
        rustEvicted,
        'poolSize before:',
        poolRef.current.size
      );

      if (rustEvicted) {
        poolRef.current.delete(rustEvicted);
        lruOrderRef.current = lruOrderRef.current.filter((id) => id !== rustEvicted);
      }

      poolRef.current.set(tabId, { tabId });
      lruOrderRef.current = lruOrderRef.current.filter((id) => id !== tabId);
      lruOrderRef.current.push(tabId);

      console.log(
        '[ADL-DEBUG] [BrowserPool] pool after create',
        'poolKeys:',
        Array.from(poolRef.current.keys()),
        'lruOrder:',
        lruOrderRef.current
      );

      rerender();
      bumpPoolVersion();

      return rustEvicted;
    },
    [rerender, bumpPoolVersion]
  );

  const activateTabInPool = useCallback(async (tabId: string) => {
    lruOrderRef.current = lruOrderRef.current.filter((id) => id !== tabId);
    lruOrderRef.current.push(tabId);

    if (isTauriShell()) {
      const bridge = window.digitalLife?.browser;
      if (bridge) {
        await bridge.activateTab(tabId);
      }
    }
  }, []);

  const removeFromPool = useCallback(
    (tabId: string) => {
      const wasInPool = poolRef.current.has(tabId);
      poolRef.current.delete(tabId);
      console.log(
        '[ADL-DEBUG] [BrowserPool] removeFromPool',
        'tabId:',
        tabId,
        'had it:',
        wasInPool
      );
      lruOrderRef.current = lruOrderRef.current.filter((id) => id !== tabId);
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
    poolSize: poolRef.current.size,
    isTabInPool,
    createWebViewForTab,
    activateTabInPool,
    removeFromPool: destroyTabWebView,
    poolVersion,
  };
}
