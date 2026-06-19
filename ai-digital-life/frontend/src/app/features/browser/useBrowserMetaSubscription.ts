import { useEffect } from 'react';
import { isTauriShell } from '../../../tauri-bridge';

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
    const unsub = bridge.onMetaChanged(handlePageMeta);
    return () => {
      unsub();
    };
  }, [handlePageMeta]);
}
