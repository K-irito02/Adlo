import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { IpcErrorCode } from '@shared/ipc/shared';
import type { BrowserMenuItem } from './useBrowserMenus';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import type { useTCopy } from '@i18n/useTCopy';
import { startBookmarkImportPick } from '@features/bookmarks/startBookmarkImportPick';

interface UseBrowserPanelMenuItemsParams {
  activeTab: BrowserTabState | undefined;
  zoomLevel: number;
  setZoomLevel: (level: number) => void;
  t: ReturnType<typeof useTCopy>['t'];
}

/** `Error` 上挂的 IPC 错误码（见 `requireIpcOk`）。 */
function errorCodeOf(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

/**
 * 浏览器工具栏「更多操作」菜单项。
 *
 * 中心与右侧面板共用本 hook（两处都是“当前标签”语义）；标签页 WebView 是
 * 两个宿主共享的池里的子 WebView，因此菜单动作统一按 `activeTab.id` 定位，避免
 * 落到发起 invoke 的应用壳 webview。
 *
 * 失败通过 toast 显性反馈：此前 devtools 用 `invoke(...) + catch {}`，失败时
 * 没有任何提示（用户侧表现为“点了没反应”）。
 */
export function useBrowserPanelMenuItems({
  activeTab,
  zoomLevel,
  setZoomLevel,
  t,
}: UseBrowserPanelMenuItemsParams): { browserMenuItems: BrowserMenuItem[] } {
  const isTauri = useAppStore((s) => s.isTauri);
  const showToast = useAppStore((s) => s.showToast);

  const tabId = activeTab?.id;

  /** 需要“标签页 WebView 已存在”的动作：失败时按错误码给出可理解的提示。 */
  const runTabAction = useCallback(
    async (action: (id: string) => Promise<void>, successMessage?: string) => {
      if (!tabId) {
        return;
      }
      try {
        await action(tabId);
        if (successMessage) {
          showToast(successMessage, 'success', 'browser-menu');
        }
      } catch (error) {
        const message =
          errorCodeOf(error) === IpcErrorCode.NOT_FOUND
            ? t.browserToastTabNotReady
            : t.browserToastActionFailed;
        showToast(message, 'error', 'browser-menu');
      }
    },
    [tabId, showToast, t],
  );

  /**
   * 缩放：以 ref 作为「最新基座」源头，先推进再下发。
   *
   * 基座若等 IPC 往返成功后才前移，同一往返窗口内连点两次会基于同一个旧值
   * 计算（1.0 → 1.1 两次）。这里用 ref 保证第 N+1 次点击基于第 N 次的结果，
   * 不依赖 React 的重渲染时机；下发失败再回滚，避免界面与实际不一致。
   */
  const zoomBaseRef = useRef(zoomLevel);
  useEffect(() => {
    zoomBaseRef.current = zoomLevel;
    // 换标签 / 首次拿到标签时也要重同步：无标签时 `setZoomLevel` 是 no-op，
    // 否则 ref 会停在上一次推进的值，新建标签后首次缩放会跳档。
  }, [tabId, zoomLevel]);

  const zoomTo = useCallback(
    (compute: (current: number) => number) => {
      if (!tabId) {
        return;
      }
      const prev = zoomBaseRef.current;
      const next = compute(prev);
      if (next === prev) {
        return;
      }
      zoomBaseRef.current = next;
      setZoomLevel(next);
      void runTabAction(async (id) => {
        try {
          await window.digitalLife.browser.setZoom(id, next);
        } catch (error) {
          // 代际守卫：只有“最新一次请求”失败才回滚；连点时较早的失败晚到，
          // 不得把已经前进的基座拉回去（否则界面与 WebView 实际缩放不一致）。
          if (zoomBaseRef.current === next) {
            zoomBaseRef.current = prev;
            setZoomLevel(prev);
          }
          throw error;
        }
      });
    },
    [runTabAction, setZoomLevel, tabId],
  );

  const browserMenuItems = useMemo<BrowserMenuItem[]>(
    () => [
      {
        id: 'hard-reload',
        label: t.browserHardReload,
        hint: t.browserHardReloadHint,
        // 忽略缓存只能由平台侧 `Page.reload{ignoreCache}` 兑现；浏览器预览模式的
        // iframe 无法绕过缓存，按既有「仅桌面」惯例禁用，而不是假装成功。
        disabled: !isTauri,
        action: () => {
          void runTabAction((id) => window.digitalLife.browser.hardReloadTab(id));
        },
      },
      { id: 'sep-1', separator: true as const },
      {
        id: 'clear-site-cookies',
        label: t.browserClearSiteCookies,
        hint: t.browserClearSiteCookiesHint,
        disabled: !isTauri,
        action: () => {
          void runTabAction(
            (id) => window.digitalLife.browser.clearSiteCookies(id),
            t.browserToastSiteCookiesCleared,
          );
        },
      },
      {
        id: 'clear-cookies',
        label: t.browserClearCookies,
        hint: t.browserClearCookiesHint,
        disabled: !isTauri,
        action: () => {
          void runTabAction(
            (id) => window.digitalLife.browser.clearCookies(id),
            t.browserToastCookiesCleared,
          );
        },
      },
      { id: 'sep-2', separator: true as const },
      {
        id: 'clear-site-cache',
        label: t.browserClearSiteCache,
        hint: t.browserClearSiteCacheHint,
        disabled: !isTauri,
        action: () => {
          void runTabAction(
            (id) => window.digitalLife.browser.clearSiteCache(id),
            t.browserToastSiteCacheCleared,
          );
        },
      },
      {
        id: 'clear-cache',
        label: t.browserClearCache,
        hint: t.browserClearCacheHint,
        disabled: !isTauri,
        action: () => {
          void runTabAction(
            (id) => window.digitalLife.browser.clearCache(id),
            t.browserToastCacheCleared,
          );
        },
      },
      { id: 'sep-3', separator: true as const },
      {
        id: 'devtools',
        label: t.browserDeveloperTools,
        hint: t.browserDeveloperToolsHint,
        disabled: !isTauri,
        action: () => {
          void runTabAction((id) => window.digitalLife.browser.openDevtools(id));
        },
      },
      { id: 'sep-4', separator: true as const },
      {
        id: 'zoom-in',
        label: t.menuZoomIn,
        hint: t.menuZoomInHint,
        disabled: !isTauri,
        action: () => zoomTo((current) => Math.min(2, Math.round((current + 0.1) * 10) / 10)),
      },
      {
        id: 'zoom-out',
        label: t.menuZoomOut,
        hint: t.menuZoomOutHint,
        disabled: !isTauri,
        action: () => zoomTo((current) => Math.max(0.5, Math.round((current - 0.1) * 10) / 10)),
      },
      {
        id: 'zoom-reset',
        label: t.menuResetZoom,
        hint: t.menuResetZoomHint,
        disabled: !isTauri,
        action: () => zoomTo(() => 1.0),
      },
      { id: 'sep-5', separator: true as const },
      {
        id: 'import-bookmarks',
        label: t.browserImportBookmarks,
        hint: t.browserImportBookmarksHint,
        action: () => startBookmarkImportPick(t),
      },
      {
        id: 'export-bookmarks',
        label: t.browserExportBookmarks,
        hint: t.browserExportBookmarksHint,
        action: () => useAppStore.getState().setBookmarkTransferDialog('export'),
      },
    ],
    [isTauri, runTabAction, t, zoomTo],
  );

  return { browserMenuItems };
}
