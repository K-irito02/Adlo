import { useEffect } from 'react';
import { isTauriShell } from '@shared/env';
import type { BrowserNewTabRequest } from '@shared/ipc/browser';

/**
 * Subscribes to WebView2 new-window requests (`target="_blank"` / `window.open`)
 * in Tauri mode. The payload carries the requesting tab so the caller can open
 * the new tab in the same host (center page → center tab, panel page → panel tab).
 */
export function useBrowserNewTabSubscription(
  onOpenNewTab: (request: BrowserNewTabRequest) => void,
) {
  useEffect(() => {
    if (!isTauriShell()) {
      return;
    }
    const bridge = window.digitalLife?.browser;
    if (!bridge?.onOpenNewTab) {
      return;
    }
    const unsub = bridge.onOpenNewTab((request) => {
      if (request.url) {
        onOpenNewTab(request);
      }
    });
    return () => {
      unsub();
    };
  }, [onOpenNewTab]);
}
