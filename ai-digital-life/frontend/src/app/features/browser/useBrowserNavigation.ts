import { useCallback } from 'react';
import { isTauriShell } from '@shared/env';

interface UseBrowserNavigationOptions {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  iframeHistory: { index: number; entries: string[] };
  navigateBrowser: (url: string) => void;
  activeTabId?: string;
}

export function useBrowserNavigation(options: UseBrowserNavigationOptions) {
  const { iframeRef, iframeHistory, navigateBrowser, activeTabId } = options;

  const handleGoBack = useCallback(() => {
    if (isTauriShell()) {
      if (!activeTabId) {
        return;
      }
      window.digitalLife?.browser?.goBackTab(activeTabId).catch((err) => {
        console.warn('browser navigate failed', err);
      });
    } else if (
      iframeRef.current &&
      iframeHistory.index > 0 &&
      iframeHistory.entries[iframeHistory.index - 1]
    ) {
      navigateBrowser(iframeHistory.entries[iframeHistory.index - 1]);
    }
  }, [iframeRef, iframeHistory, navigateBrowser, activeTabId]);

  const handleGoForward = useCallback(() => {
    if (isTauriShell()) {
      if (!activeTabId) {
        return;
      }
      window.digitalLife?.browser?.goForwardTab(activeTabId).catch((err) => {
        console.warn('browser navigate failed', err);
      });
    } else if (
      iframeRef.current &&
      iframeHistory.index < iframeHistory.entries.length - 1 &&
      iframeHistory.entries[iframeHistory.index + 1]
    ) {
      navigateBrowser(iframeHistory.entries[iframeHistory.index + 1]);
    }
  }, [iframeRef, iframeHistory, navigateBrowser, activeTabId]);

  const handleReload = useCallback(() => {
    if (isTauriShell()) {
      if (!activeTabId) {
        return;
      }
      window.digitalLife?.browser?.reloadTab(activeTabId).catch((err) => {
        console.warn('browser navigate failed', err);
      });
    } else if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.location.reload();
    }
  }, [iframeRef, activeTabId]);

  return { handleGoBack, handleGoForward, handleReload };
}
