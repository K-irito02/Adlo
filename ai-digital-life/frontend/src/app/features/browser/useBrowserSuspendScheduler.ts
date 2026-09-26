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
  activeTabId: string;
  inPool: (tabId: string) => boolean;
  lastActivatedMs: Record<string, number>;
  idleMs: number;
  protected: (t: BrowserTabState) => boolean;
  now: number;
}

/** Return tab IDs (unprotected, inactive, in-pool, idle) ordered oldest-activated-first. */
export function applyIdlePass(input: SuspendPassInput): string[] {
  const { tabs, activeTabId, inPool, lastActivatedMs, idleMs, protected: isProtected, now } = input;
  return tabs
    .filter(
      (t) =>
        t.id !== activeTabId &&
        inPool(t.id) &&
        !isProtected(t) &&
        lastActivatedMs[t.id] !== undefined &&
        now - (lastActivatedMs[t.id] ?? now) >= idleMs,
    )
    .sort((a, b) => (lastActivatedMs[a.id] ?? 0) - (lastActivatedMs[b.id] ?? 0))
    .map((t) => t.id);
}

interface SchedulerOptions {
  isVisible: boolean;
  removeFromPool: (tabId: string) => Promise<void>;
  isTabInPool: (tabId: string) => boolean;
  activeTabId: string;
}

export function useBrowserSuspendScheduler(opts: SchedulerOptions) {
  const lastActivatedMsRef = useRef<Record<string, number>>({});
  const { isVisible, removeFromPool, isTabInPool, activeTabId } = opts;

  useEffect(() => {
    if (activeTabId) {
      lastActivatedMsRef.current[activeTabId] = Date.now();
    }
  }, [activeTabId]);

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
          activeTabId: state.browserActiveTabId,
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
                activeTabId: state2.browserActiveTabId,
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
