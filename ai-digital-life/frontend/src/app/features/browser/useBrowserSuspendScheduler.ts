import { useEffect, useRef } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { isTauriShell } from '@shared/env';
import { DEFAULT_BROWSER_SUSPEND_MS } from '@shared/defaultPreferences';
import type { BrowserTabState } from '@stores/slices/browserSlice';

const IDLE_INTERVAL_MS = 20_000;
// 与 DEFAULT_BROWSER_SUSPEND_MS 同一产品默认（单源引用，防漂移）。
const DEFAULT_IDLE_MS = DEFAULT_BROWSER_SUSPEND_MS;

export interface SuspendPassInput {
  tabs: BrowserTabState[];
  protectedActiveTabIds: ReadonlySet<string>;
  inPool: (tabId: string) => boolean;
  lastActivatedMs: Record<string, number>;
  idleMs: number;
  protected: (t: BrowserTabState) => boolean;
  now: number;
}

/** Return tab IDs (unprotected, not protected-active, in-pool, idle) ordered oldest-activated-first. */
export function applyIdlePass(input: SuspendPassInput): string[] {
  const {
    tabs,
    protectedActiveTabIds,
    inPool,
    lastActivatedMs,
    idleMs,
    protected: isProtected,
    now,
  } = input;
  return tabs
    .filter(
      (t) =>
        !protectedActiveTabIds.has(t.id) &&
        inPool(t.id) &&
        !isProtected(t) &&
        lastActivatedMs[t.id] !== undefined &&
        now - (lastActivatedMs[t.id] ?? now) >= idleMs,
    )
    .sort((a, b) => (lastActivatedMs[a.id] ?? 0) - (lastActivatedMs[b.id] ?? 0))
    .map((t) => t.id);
}

export interface ProtectedActiveSources {
  browserActiveTabId: string;
  centerTabs: { id: string; kind: string; refId: string | null }[];
  centerActiveTabId: string;
}

/**
 * 受挂起保护的活动标签 id 集合（spec §6.2）。
 *
 * 挂起调度每 tick 从 store 现算，覆盖两个宿主的活动浏览器标签：
 * - 面板活动浏览器标签（`browserActiveTabId`）
 * - 中心活动标签（若其 kind === 'browser'，取其 refId）
 *
 * 被移入中心的活动标签仍在共享池中、且切到中心后面板 lifecycle effect 不再跑，
 * 因此不能只依赖面板传入的活动 id —— 必须在销毁前于此处统一保护。
 * dsh 标签是普通标签，不再享有额外免挂起保护。
 */
export function collectProtectedActiveTabIds(state: ProtectedActiveSources): Set<string> {
  const ids = new Set<string>();
  if (state.browserActiveTabId) {
    ids.add(state.browserActiveTabId);
  }
  const centerActive = state.centerTabs.find((tab) => tab.id === state.centerActiveTabId);
  if (centerActive?.kind === 'browser' && centerActive.refId) {
    ids.add(centerActive.refId);
  }
  return ids;
}

interface SchedulerOptions {
  isVisible: boolean;
  removeFromPool: (tabId: string) => Promise<void>;
  isTabInPool: (tabId: string) => boolean;
}

export function useBrowserSuspendScheduler(opts: SchedulerOptions) {
  const lastActivatedMsRef = useRef<Record<string, number>>({});
  const { isVisible, removeFromPool, isTabInPool } = opts;

  useEffect(() => {
    if (!isVisible) {
      return;
    }
    // F-L1：卸载标记，供异步内存压力 pass 检测以在卸载后及时退出。
    let disposed = false;
    const tick = () => {
      // F-H1：每次 tick 读取最新配置（AppInfo 加载/更新后即时生效），无需重挂 effect。
      const idleMs =
        useAppStore.getState().appInfo?.config?.browserInactiveTabSuspendMs ?? DEFAULT_IDLE_MS;
      const now = Date.now();
      const state = useAppStore.getState();
      const isProtected = (t: BrowserTabState): boolean =>
        t.isPinned || t.isPlayingAudio || t.isDownloading;
      // 受保护的活动标签（面板活动 + 中心活动浏览器）每 tick 现算，
      // 在此刷新它们的激活时间戳：单宿主 prop 已删除，双宿主下仅靠传入 activeTabId
      // 会漏记另一宿主的活动标签，导致其 lastActivated 陈旧而被误挂起。
      const protectedActiveTabIds = collectProtectedActiveTabIds(state);
      for (const id of protectedActiveTabIds) {
        lastActivatedMsRef.current[id] = now;
      }
      // Tabs whose removeFromPool was already issued this tick (Set deletion is
      // async inside destroyTabWebView), so isTabInPool may still report them in-pool.
      const suspendedThisTick = new Set<string>();

      const suspendTab = (tabId: string) => {
        void removeFromPool(tabId).catch((e) =>
          console.warn('destroyTab failed, tab left in pool:', e),
        );
      };

      // F-H2：配置为 0（设置"Off"）时不发起闲置挂起，仅内存压力仍生效。
      if (idleMs > 0) {
        for (const id of applyIdlePass({
          tabs: state.browserTabs,
          protectedActiveTabIds,
          inPool: isTabInPool,
          lastActivatedMs: lastActivatedMsRef.current,
          idleMs,
          protected: isProtected,
          now,
        })) {
          if (suspendedThisTick.has(id)) {
            continue;
          }
          suspendedThisTick.add(id);
          suspendTab(id);
        }
      }

      if (isTauriShell()) {
        void (async () => {
          try {
            let pressured = (await window.digitalLife?.browser?.memoryPressure()) ?? false;
            while (pressured) {
              // F-L1：卸载后不再继续内存压力挂起。
              if (disposed) {
                return;
              }
              const state2 = useAppStore.getState();
              const candidates = applyIdlePass({
                tabs: state2.browserTabs,
                protectedActiveTabIds: collectProtectedActiveTabIds(state2),
                inPool: isTabInPool,
                lastActivatedMs: lastActivatedMsRef.current,
                idleMs: 0, // memory pressure: suspend oldest unprotected inactive in-pool tab regardless of idle age
                protected: isProtected,
                now: Date.now(),
              }).filter((id) => !suspendedThisTick.has(id));
              if (candidates.length === 0) {
                return;
              }
              const target = candidates[0];
              suspendedThisTick.add(target);
              suspendTab(target);
              pressured = (await window.digitalLife?.browser?.memoryPressure()) ?? false;
              if (disposed) {
                return;
              }
            }
          } catch (e) {
            console.warn('memory-pressure pass failed:', e);
          }
        })();
      }
    };
    tick();
    const timer = window.setInterval(tick, IDLE_INTERVAL_MS);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [isVisible, removeFromPool, isTabInPool]);
}
