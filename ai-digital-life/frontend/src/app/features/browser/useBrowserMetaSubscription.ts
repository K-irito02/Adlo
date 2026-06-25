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
    console.info('[browser-debug] useBrowserMetaSubscription: subscribing to meta-changed');
    const unsub = bridge.onMetaChanged((meta) => {
      console.info('[browser-debug] onMetaChanged fired:', JSON.stringify(meta));
      handlePageMeta(meta);
    });
    return () => {
      console.info('[browser-debug] useBrowserMetaSubscription: unsubscribing');
      unsub();
    };
  }, [handlePageMeta]);
}
