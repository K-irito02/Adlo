import { useEffect } from 'react';
import { isTauriShell } from '@shared/env';
import { useAppStore } from '@stores';
import { normalizeUrlForCompare } from './browserUrlUtils';

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
        const normalizedMetaUrl = normalizeUrlForCompare(meta.url);
        if (eventTab && normalizeUrlForCompare(eventTab.url) !== normalizedMetaUrl) {
          state.browserUpdateTab(tabId, { url: normalizedMetaUrl });
        }
      }
      handlePageMeta(meta);
    });
    return () => {
      unsub();
    };
  }, [handlePageMeta]);
}
