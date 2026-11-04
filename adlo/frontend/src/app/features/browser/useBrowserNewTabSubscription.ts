import { useEffect } from 'react';
import { isTauriShell } from '@shared/env';

/**
 * Subscribes to WebView2 new-window requests (`target="_blank"` / `window.open`)
 * in Tauri mode and opens a brand-new browser tab for the requested URL —
 * matching Edge/Chrome semantics where such links open in a new tab, keeping
 * the source tab's history stack clean.
 */
export function useBrowserNewTabSubscription(onOpenNewTab: (url: string) => void) {
  useEffect(() => {
    if (!isTauriShell()) {
      return;
    }
    const bridge = window.digitalLife?.browser;
    if (!bridge?.onOpenNewTab) {
      return;
    }
    const unsub = bridge.onOpenNewTab((url) => {
      if (url) {
        onOpenNewTab(url);
      }
    });
    return () => {
      unsub();
    };
  }, [onOpenNewTab]);
}
