import { useCallback, useRef } from 'react';
import { getGoogleFaviconUrl } from '@utils/favicon';

export interface UseBrowserPanelHandlersParams {
  browserOpenTab: (url?: string, title?: string, workspaceId?: string, folderId?: string) => void;
  browserNavigateActiveTab: (url: string, title?: string) => void;
  browserSelectTab: (tabId: string) => void;
  browserNavigateInPlace: boolean;
  setBrowserNavigateInPlace: (value: boolean) => void;
}

export interface UseBrowserPanelHandlersResult {
  pendingNavigationsRef: React.MutableRefObject<Set<string>>;
  handleNavigationStart: (url: string) => void;
  handleOpenTabFromTree: (url: string, tabId?: string) => void;
  handleToggleNavigateMode: (checked: boolean) => void;
  handlePointerDown: (e: React.PointerEvent) => void;
}

export function useBrowserPanelHandlers(
  params: UseBrowserPanelHandlersParams,
): UseBrowserPanelHandlersResult {
  const {
    browserOpenTab,
    browserNavigateActiveTab,
    browserSelectTab,
    browserNavigateInPlace,
    setBrowserNavigateInPlace,
  } = params;

  const pendingNavigationsRef = useRef(new Set<string>());

  const handleNavigationStart = useCallback((url: string) => {
    // Track pending navigation so handlePageMeta creates tab only when real title arrives
    pendingNavigationsRef.current.add(url);
    // Preload Google S2 favicon so image is already loading when tab renders
    const faviconUrl = getGoogleFaviconUrl(url);
    if (faviconUrl) {
      new Image().src = faviconUrl;
    }
  }, []);

  const handleOpenTabFromTree = useCallback(
    (url: string, tabId?: string) => {
      if (tabId) {
        // Clicking an existing tab → switch to it (unaffected by toggle)
        browserSelectTab(tabId);
      } else if (browserNavigateInPlace) {
        // "Current tab" mode → navigate within the active tab
        browserNavigateActiveTab(url);
      } else {
        // "New tab" mode → open a new tab
        browserOpenTab(url, url);
      }
    },
    [browserOpenTab, browserNavigateActiveTab, browserSelectTab, browserNavigateInPlace],
  );

  const handleToggleNavigateMode = useCallback(
    (checked: boolean) => {
      setBrowserNavigateInPlace(checked);
    },
    [setBrowserNavigateInPlace],
  );

  const handlePointerDown = useCallback((_e: React.PointerEvent) => {}, []);

  return {
    pendingNavigationsRef,
    handleNavigationStart,
    handleOpenTabFromTree,
    handleToggleNavigateMode,
    handlePointerDown,
  };
}
