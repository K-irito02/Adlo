import { useEffect } from 'react';
import { isTauriShell } from '@tauri-bridge';
import { useAppStore } from '@stores';

export function useBrowserMetaSubscription(
  handlePageMeta: (meta: { title: string; favicon: string; url: string }) => void
) {
  useEffect(() => {
    if (!isTauriShell()) {
      return;
    }
    const bridge = window.digitalLife?.browser;
    if (!bridge) {
      return;
    }
    const unsub = bridge.onMetaChanged((tabId, meta) => {
      if (tabId) {
        const state = useAppStore.getState();
        const eventTab = state.browserTabs.find((t) => t.id === tabId);
        if (eventTab && eventTab.url !== meta.url) {
          state.browserUpdateTab(tabId, { url: meta.url });
        }
      }
      handlePageMeta(meta);
    });
    return () => {
      unsub();
    };
  }, [handlePageMeta]);
}
