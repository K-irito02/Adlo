import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { isTauriShell } from '../../../tauri-bridge';

interface UseBrowserNavigationOptions {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  iframeHistory: { index: number; entries: string[] };
  navigateBrowser: (url: string) => void;
}

export function useBrowserNavigation(options: UseBrowserNavigationOptions) {
  const { iframeRef, iframeHistory, navigateBrowser } = options;

  const handleGoBack = useCallback(() => {
    if (isTauriShell()) {
      invoke('browser_go_back').catch((err) =>
        console.error('browser_go_back failed:', err)
      );
    } else if (
      iframeRef.current &&
      iframeHistory.index > 0 &&
      iframeHistory.entries[iframeHistory.index - 1]
    ) {
      navigateBrowser(iframeHistory.entries[iframeHistory.index - 1]);
    }
  }, [iframeRef, iframeHistory, navigateBrowser]);

  const handleGoForward = useCallback(() => {
    if (isTauriShell()) {
      invoke('browser_go_forward').catch((err) =>
        console.error('browser_go_forward failed:', err)
      );
    } else if (
      iframeRef.current &&
      iframeHistory.index < iframeHistory.entries.length - 1 &&
      iframeHistory.entries[iframeHistory.index + 1]
    ) {
      navigateBrowser(iframeHistory.entries[iframeHistory.index + 1]);
    }
  }, [iframeRef, iframeHistory, navigateBrowser]);

  const handleReload = useCallback(() => {
    if (isTauriShell()) {
      invoke('browser_reload').catch((err) =>
        console.error('browser_reload failed:', err)
      );
    } else if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.location.reload();
    }
  }, [iframeRef]);

  return { handleGoBack, handleGoForward, handleReload };
}
