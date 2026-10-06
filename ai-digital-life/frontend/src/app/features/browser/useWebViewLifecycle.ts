import { useCallback, useEffect, useRef, useState } from 'react';
import { isTauriShell } from '@shared/env';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import { useAppStore } from '@stores/slicedStore';
import { shouldHostHideTab } from './browserPoolSingleton';
import { getResolvedTheme } from './useBrowserThemeSync';
import { HIDDEN_WEBVIEW_OFFSCREEN_COORD } from './useWebViewVisibility';
import { isDownloadUrl } from '@utils/downloadUrl';
import { isLoopbackHttpUrl, waitForLoopbackReachable } from './loopbackReadiness';
import { clearRevealPending, isRevealPending, markRevealPending } from './browserRevealGate';

/** 首帧揭示门控的兜底上限：页面迟迟不发元数据（或加载失败）时仍按时揭示。 */
const REVEAL_FALLBACK_MS = 12_000;

interface UseWebViewLifecycleOptions {
  /** 宿主标识（panel / center）：仅用于诊断日志，refs 天然 per-hook-instance。 */
  hostId: 'panel' | 'center';
  activeTab?: BrowserTabState;
  webViewDisabled: boolean;
  isTabInPool: (tabId: string) => boolean;
  createWebViewForTab: (
    tabId: string,
    url: string,
    colorScheme?: 'light' | 'dark',
    location?: 'panel' | 'center',
  ) => Promise<string | null>;
  activateTabInPool: (tabId: string) => Promise<void>;
  webViewActiveRef: React.RefObject<boolean>;
  overlayActiveRef: React.RefObject<boolean>;
  updateWebViewBounds: () => void;
}

/**
 * WebView 生命周期 Hook：负责活动 Tab 变化时创建/激活 WebView。
 *
 * 职责：
 * - 活动 Tab 变化时，若 WebView 不在池中则创建，然后激活
 * - 切换离开旧 Tab 时将其 WebView 移出屏幕
 * - overlay 激活期间跳过激活以避免 undo 隐藏机制
 * - 卸载时清理 webViewActiveRef
 * - 持有 loadingTabId 状态与 prevActiveTabIdRef
 *
 * 首帧揭示（避免空白/白闪）：新建的 WebView2 位于屏外，登记 browserRevealGate 后
 * **暂不应用边界**（保持屏外、加载动画可见）；等原生「页面加载完成」事件或超时后，
 * 才解除门控并应用边界，实现「加载动画 → 内容」无缝替换。
 */
export function useWebViewLifecycle(options: UseWebViewLifecycleOptions) {
  const {
    hostId,
    activeTab,
    webViewDisabled,
    isTabInPool,
    createWebViewForTab,
    activateTabInPool,
    webViewActiveRef,
    overlayActiveRef,
    updateWebViewBounds,
  } = options;

  const [loadingTabId, setLoadingTabId] = useState<string | null>(null);
  const prevActiveTabIdRef = useRef<string | null>(null);
  /** 最新 activeTab 的镜像：供仅卸载时运行的 cleanup 读取，避免将 activeTab
   *  放入 cleanup effect 依赖而每次切换都触发隐藏。 */
  const activeTabSnapshotRef = useRef(activeTab);
  activeTabSnapshotRef.current = activeTab;
  /** Tracks the URL each tab's WebView is currently showing, so we can detect
   *  same-tab URL changes (e.g. "current tab" mode navigation) and call
   *  `navigateTab` instead of just `activateTab`. */
  const tabUrlMapRef = useRef<Map<string, string>>(new Map());
  /** Tabs created during the current session (not hydrated from restart).
   *  The isDownloadUrl check is skipped for these tabs so that download links
   *  clicked in-page (target="_blank") can open a new tab and trigger
   *  DownloadStarting normally. Only hydrated restart tabs are suppressed. */
  const freshTabIdsRef = useRef<Set<string>>(new Set());
  /** Per-tab fallback timers for the reveal gate (see `revealTab`). */
  const revealTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  /** Tabs whose page-ready event arrived since their current WebView was created.
   *  Covers the race where page-ready fires during creation (before the reveal gate
   *  is registered) — the post-create check reveals it immediately. */
  const pageReadyRef = useRef<Set<string>>(new Set());

  const clearRevealTimer = useCallback((tabId: string) => {
    const timer = revealTimersRef.current.get(tabId);
    if (timer) {
      clearTimeout(timer);
      revealTimersRef.current.delete(tabId);
    }
  }, []);

  /**
   * 应用边界并清加载态（**强制揭示**路径：page-ready 或兜底定时器）。
   *
   * 门控是**跨宿主共享**的模块级集合，而只有「该 tab 所属宿主」才能应用它的边界。
   * 因此本宿主活动 Tab 不是该 tab 时**保留门控**（不清除）——否则先处理该信号的
   * 非所属宿主会清掉门控却不揭示，导致所属宿主永远无法揭示（一直加载直到某次 resize）。
   */
  const revealNow = useCallback(
    (tabId: string) => {
      // 先清定时器：即使本宿主不是该 tab 的活动宿主（不清门控），也要移除陈旧 timer id，
      // 否则后续 `has()` 幂等补齐会被挡住（F5）。
      clearRevealTimer(tabId);
      if (activeTabSnapshotRef.current?.id !== tabId) {
        return;
      }
      clearRevealPending(tabId);
      updateWebViewBounds();
      setLoadingTabId((prev) => (prev === tabId ? null : prev));
    },
    [clearRevealTimer, updateWebViewBounds],
  );

  // 页面就绪路径：仅当仍处于待揭示窗口时揭示（避免对无关 tab 重复揭示）。
  const revealTab = useCallback(
    (tabId: string) => {
      if (!isRevealPending(tabId)) {
        return;
      }
      revealNow(tabId);
    },
    [revealNow],
  );

  /** 供一次性订阅读取最新 revealTab，避免依赖变化导致重订阅空窗（F9）。 */
  const revealTabRef = useRef(revealTab);
  revealTabRef.current = revealTab;

  // 页面就绪信号：原生「页面加载完成」事件（页面已完成文档加载并渲染出内容）。
  // 用页面加载完成（而非标题元数据——它可能早于首帧绘制）作为揭示时机，避免空白首帧闪烁。
  useEffect(() => {
    if (!isTauriShell()) {
      return;
    }
    const bridge = window.digitalLife?.browser;
    if (!bridge?.onPageReady) {
      return;
    }
    const unsub = bridge.onPageReady((tabId) => {
      if (tabId) {
        pageReadyRef.current.add(tabId);
        revealTabRef.current(tabId);
      }
    });
    return () => {
      unsub();
    };
  }, []);

  // When active tab changes: create WebView if not in pool, then activate
  useEffect(() => {
    if (!isTauriShell() || webViewDisabled) {
      return;
    }
    // 本轮 effect 的取消令牌：卸载/依赖变化时中止在途的 loopback 等待，避免为陈旧 tab 继续创建。
    const ac = new AbortController();
    const tab = activeTab;

    // When the effect re-fires due to an activeTab object reference change
    // while the tab ID hasn't changed and an overlay is active, skip entirely.
    // Otherwise activateTabInPool would call webview.show() in Rust, undoing
    // the overlay-hide mechanism (setTabBounds off-screen).
    // Note: only check overlayActiveRef (React overlay state), NOT
    // hideWebViewRequestedRef (DOM overlay detection). DOM overlays are
    // handled by the visibility hook's MutationObserver; the lifecycle must
    // still run to create/activate/bounds-update the WebView.
    // Historical: hideWebViewRequestedRef was previously checked here to
    // prevent hide↔show ping-pong (flickering) — this is now avoided by the
    // MutationObserver-based approach in useWebViewVisibility.
    if (tab?.id != null && tab.id === prevActiveTabIdRef.current && overlayActiveRef.current) {
      return;
    }

    // Hide previous tab's WebView when switching away (including to an empty new tab).
    // E1 双宿主竞态守卫：按 store 最新归属判定 —— 若该 tab 已被移入另一宿主
    // （面板→中心或反向），本宿主不得隐藏，否则会盖掉新宿主的显示。
    if (prevActiveTabIdRef.current && prevActiveTabIdRef.current !== tab?.id) {
      const prevId = prevActiveTabIdRef.current;
      if (isTabInPool(prevId)) {
        const freshPrev = useAppStore.getState().browserTabsById[prevId];
        if (shouldHostHideTab(hostId, freshPrev)) {
          window.digitalLife?.browser
            ?.setTabBounds(prevId, {
              x: HIDDEN_WEBVIEW_OFFSCREEN_COORD,
              y: HIDDEN_WEBVIEW_OFFSCREEN_COORD,
              width: 1,
              height: 1,
            })
            .catch((e) => {
              console.warn('[useWebViewLifecycle] failed to hide previous tab WebView:', e);
            });
        }
      }
    }
    prevActiveTabIdRef.current = tab?.id ?? null;

    if (!tab || !tab.url || tab.url === 'about:blank' || tab.url.trim() === '') {
      webViewActiveRef.current = false;
      // Hide the current tab's WebView so stale content doesn't remain
      // visible when the tab transitions to about:blank (e.g. "+" button
      // in "current tab" mode).
      if (tab?.id && isTabInPool(tab.id)) {
        window.digitalLife?.browser
          ?.setTabBounds(tab.id, {
            x: HIDDEN_WEBVIEW_OFFSCREEN_COORD,
            y: HIDDEN_WEBVIEW_OFFSCREEN_COORD,
            width: 1,
            height: 1,
          })
          .catch((e) => {
            console.warn('[useWebViewLifecycle] failed to hide about:blank WebView:', e);
          });
      }
      if (tab?.id) {
        tabUrlMapRef.current.set(tab.id, tab.url);
      }
      return;
    }

    const activateOrCreate = async () => {
      const currentTabId = tab.id;
      try {
        if (!isTabInPool(currentTabId)) {
          // Restart suppression: skip WebView creation for download URLs on
          // hydrated (restart) tabs. Tabs created during the current session
          // (e.g. from browser-open-new-tab for in-page download links) must
          // NOT be suppressed — they need a WebView to trigger DownloadStarting.
          const isFresh = freshTabIdsRef.current.has(currentTabId);
          if (isFresh) {
            freshTabIdsRef.current.delete(currentTabId);
          }
          if (!isFresh && isDownloadUrl(tab.url)) {
            webViewActiveRef.current = false;
            return;
          }
          // 重启恢复的 loopback 标签：先等服务可达再创建，避免首帧 ERR_CONNECTION_REFUSED
          // （以及失败窗口把站点元数据判成"无图标" → favicon 兜底字母）。
          if (!isFresh && isLoopbackHttpUrl(tab.url)) {
            setLoadingTabId(currentTabId);
            await waitForLoopbackReachable(tab.url, ac.signal);
            // 本轮已失效（被取消 / 已切走 / 已关闭）：不再为陈旧 tab 创建/激活 WebView。
            if (ac.signal.aborted || activeTabSnapshotRef.current?.id !== currentTabId) {
              return;
            }
          }
          // Real WebView creation: show loading.
          setLoadingTabId(currentTabId);
          // 新建 WebView → 清掉上一轮的就绪标记（可能来自被销毁重建前的旧 WebView）。
          pageReadyRef.current.delete(currentTabId);
          // 先登记门控：create/activate 的 await 期间不得应用边界（保持屏外、加载动画可见），
          // 避免该窗口里 `updateWebViewBounds` 提前露出空白首帧（F6）。
          markRevealPending(currentTabId, REVEAL_FALLBACK_MS);
          clearRevealTimer(currentTabId);

          // UDF 隔离后不再需要创建期隐藏另一宿主：中心与面板处于不同 WebView2 会话，
          // 新建控制器不会触碰另一宿主的 PreferredColorScheme。
          await createWebViewForTab(currentTabId, tab.url, getResolvedTheme(), hostId);

          webViewActiveRef.current = true;
          tabUrlMapRef.current.set(currentTabId, tab.url);
          await activateTabInPool(currentTabId);

          // 首帧揭示：等原生「页面加载完成」事件或超时后揭示（保持屏外直到内容就绪）。
          if (pageReadyRef.current.has(currentTabId)) {
            // 页面在创建期间就已就绪（事件早到）→ 强制揭示。用 revealNow 而非 revealTab：
            // 早到的 page-ready 可能已把门控清掉（那时尚未入池、未应用边界），revealTab 的
            // pending 守卫会直接 return 导致永不揭示。
            revealNow(currentTabId);
          } else {
            // 兜底定时器：刷新门控 deadline 与定时器对齐（避免 create 与 activate 之间的
            // 时间差造成门控提前过期、在窗口内被 updateWebViewBounds 提前揭示）。
            markRevealPending(currentTabId, REVEAL_FALLBACK_MS);
            revealTimersRef.current.set(
              currentTabId,
              setTimeout(() => revealNow(currentTabId), REVEAL_FALLBACK_MS),
            );
          }
          return;
        }

        if (isRevealPending(currentTabId)) {
          // 仍在等待页面就绪：保持屏外与加载态（切换到此标签也不提前露出空白首帧）。
          webViewActiveRef.current = true;
          setLoadingTabId(currentTabId);
          // 页面已就绪（page-ready 在非活动期间到达）→ 立即揭示，不必再等兜底（F4）。
          if (pageReadyRef.current.has(currentTabId)) {
            revealTab(currentTabId);
            return;
          }
          // 门控跨宿主共享：若归属已迁移到本宿主，本宿主也需补排兜底（幂等），
          // 否则会因原宿主不再是本 tab 的活动宿主而永久无人揭示。
          if (!revealTimersRef.current.has(currentTabId)) {
            revealTimersRef.current.set(
              currentTabId,
              setTimeout(() => revealNow(currentTabId), REVEAL_FALLBACK_MS),
            );
          }
          return;
        }

        await activateTabInPool(currentTabId);
        webViewActiveRef.current = true;
        tabUrlMapRef.current.set(currentTabId, tab.url);
        if (!overlayActiveRef.current) {
          // Clear loadingTabId AFTER updateWebViewBounds runs, so the
          // loading overlay stays visible until the WebView is correctly
          // positioned.
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              updateWebViewBounds();
              setLoadingTabId(null);
            });
          });
        } else {
          setLoadingTabId(null);
        }
      } catch (e) {
        setLoadingTabId(null);
        throw e;
      }
    };

    activateOrCreate().catch((e) => {
      console.warn('[useWebViewLifecycle] activateOrCreate failed:', e);
    });

    return () => {
      ac.abort();
    };
  }, [
    hostId,
    activeTab,
    webViewDisabled,
    isTabInPool,
    createWebViewForTab,
    activateTabInPool,
    updateWebViewBounds,
    overlayActiveRef,
    webViewActiveRef,
    revealTab,
    revealNow,
    clearRevealTimer,
  ]);

  // Cleanup on unmount: clear active flag/fresh set AND hide the host's current
  // active tab WebView, so unmounting a host (e.g. switching center tabs or
  // closing the center host) never leaves a stale native surface behind.
  // E1 守卫同上：tab 已归属另一宿主时不隐藏（另一宿主正在显示它）。
  useEffect(() => {
    const freshTabIds = freshTabIdsRef.current;
    const revealTimers = revealTimersRef.current;
    return () => {
      webViewActiveRef.current = false;
      freshTabIds.clear();
      for (const timer of revealTimers.values()) {
        clearTimeout(timer);
      }
      revealTimers.clear();
      const tab = activeTabSnapshotRef.current;
      if (isTauriShell() && tab?.id && isTabInPool(tab.id)) {
        const fresh = useAppStore.getState().browserTabsById[tab.id];
        if (!shouldHostHideTab(hostId, fresh)) {
          return;
        }
        window.digitalLife?.browser
          ?.setTabBounds(tab.id, {
            x: HIDDEN_WEBVIEW_OFFSCREEN_COORD,
            y: HIDDEN_WEBVIEW_OFFSCREEN_COORD,
            width: 1,
            height: 1,
          })
          .catch((e) => {
            console.warn(`[useWebViewLifecycle] failed to hide WebView on unmount (${hostId}):`, e);
          });
      }
    };
  }, [webViewActiveRef, isTabInPool, hostId]);

  /** Mark a tab as freshly created (current session, not restart-hydrated).
   *  Call this immediately after creating a new tab so the lifecycle hook
   *  knows to skip the restart download suppression for that tab. */
  const markTabFresh = useCallback((tabId: string) => {
    freshTabIdsRef.current.add(tabId);
  }, []);

  return { loadingTabId, markTabFresh };
}
