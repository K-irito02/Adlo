import { useMemo } from 'react';
import { isTauriShell } from '@tauri-bridge';
import { useAppStore } from '@stores/slicedStore';
import type { BrowserMenuItem } from './useBrowserMenus';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import type { useTCopy } from '@i18n/useTCopy';

interface UseBrowserPanelMenuItemsParams {
  activeTab: BrowserTabState | undefined;
  browserNavigateActiveTab: (url: string, title?: string) => void;
  zoomLevel: number;
  setZoomLevel: (level: number) => void;
  t: ReturnType<typeof useTCopy>['t'];
}

export function useBrowserPanelMenuItems({
  activeTab,
  browserNavigateActiveTab,
  zoomLevel,
  setZoomLevel,
  t,
}: UseBrowserPanelMenuItemsParams): { browserMenuItems: BrowserMenuItem[] } {
  const isTauri = isTauriShell();

  const browserMenuItems = useMemo(
    () => [
      {
        id: 'hard-reload',
        label: t.browserHardReload,
        hint: t.browserHardReloadHint,
        action: () => {
          const tabTitle =
            activeTab?.title && !/^https?:\/\//i.test(activeTab.title)
              ? activeTab.title
              : undefined;
          browserNavigateActiveTab(activeTab?.url ?? 'about:blank', tabTitle);
        },
      },
      {
        id: 'copy-url',
        label: t.browserCopyCurrentUrl,
        hint: t.browserCopyCurrentUrlHint,
        action: () => void navigator.clipboard?.writeText(activeTab?.url ?? 'about:blank'),
      },
      { id: 'sep-1', separator: true as const },
      {
        id: 'clear-history',
        label: t.browserClearHistory,
        hint: t.browserClearHistoryHint,
        action: () => useAppStore.getState().browserClearHistory(),
      },
      {
        id: 'clear-cookies',
        label: t.browserClearCookies,
        hint: t.browserClearCookiesHint,
        disabled: !isTauri,
        action: () => {
          if (!activeTab?.id) {
            return;
          }
          if (isTauri) {
            window.digitalLife?.browser?.clearCookies?.(activeTab.id);
          }
        },
      },
      {
        id: 'clear-cache',
        label: t.browserClearCache,
        hint: t.browserClearCacheHint,
        disabled: !isTauri,
        action: () => {
          if (!activeTab?.id) {
            return;
          }
          if (isTauri) {
            window.digitalLife?.browser?.clearCache?.(activeTab.id);
          }
        },
      },
      {
        id: 'devtools',
        label: t.browserDeveloperTools,
        hint: t.browserDeveloperToolsHint,
        disabled: !isTauri,
        action: async () => {
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('plugin:webview|internal_toggle_devtools');
          } catch {
            // DevTools toggle may not be available
          }
        },
      },
      { id: 'sep-2', separator: true as const },
      {
        id: 'zoom-in',
        label: t.menuZoomIn,
        hint: t.menuZoomInHint,
        action: () => {
          if (!activeTab?.id) {
            return;
          }
          const next = Math.min(2, Math.round((zoomLevel + 0.1) * 10) / 10);
          if (isTauri) {
            window.digitalLife?.browser?.setZoom?.(activeTab.id, next);
          } else {
            document.documentElement.style.zoom = String(next);
          }
          setZoomLevel(next);
        },
      },
      {
        id: 'zoom-out',
        label: t.menuZoomOut,
        hint: t.menuZoomOutHint,
        action: () => {
          if (!activeTab?.id) {
            return;
          }
          const next = Math.max(0.5, Math.round((zoomLevel - 0.1) * 10) / 10);
          if (isTauri) {
            window.digitalLife?.browser?.setZoom?.(activeTab.id, next);
          } else {
            document.documentElement.style.zoom = String(next);
          }
          setZoomLevel(next);
        },
      },
      {
        id: 'zoom-reset',
        label: t.menuZoomReset,
        hint: t.menuResetZoomHint,
        action: () => {
          if (!activeTab?.id) {
            return;
          }
          if (isTauri) {
            window.digitalLife?.browser?.setZoom?.(activeTab.id, 1.0);
          } else {
            document.documentElement.style.zoom = '1';
          }
          setZoomLevel(1.0);
        },
      },
    ],
    [activeTab, browserNavigateActiveTab, t, isTauri, zoomLevel, setZoomLevel]
  );

  return { browserMenuItems };
}
