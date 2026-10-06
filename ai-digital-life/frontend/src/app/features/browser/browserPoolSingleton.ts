import { isTauriShell } from '@shared/env';
import { useAppStore } from '@stores/slicedStore';

/**
 * Shared WebView pool — a module-level singleton consumed by BOTH browser hosts
 * (right panel + center). It is the single source of truth for which tabs have
 * live WebViews (Tauri mode) or simulated pooled iframes.
 *
 * Architecture note:
 * - The pool is unbounded — suspension is driven by the frontend scheduler through
 *   `destroyTab`, not by a fixed-capacity LRU.
 * - Tauri mode: Rust's BrowserPool remains the source of truth for pool membership and
 *   eviction hints returned by `createForTab()`. The frontend Set stays in sync.
 * - Browser mode: there is no Rust pool; the Set mirrors membership and the iframe lifecycle
 *   is managed separately by `evictedIframeTabsRef` in BrowserPanelContent.
 * - `subscribe`/`getVersion` form a tiny external store for `useSyncExternalStore`,
 *   so every host re-renders when a shared member changes.
 */

type PoolListener = () => void;

export type BrowserHostId = 'panel' | 'center';

/**
 * 双宿主 hide/show 竞态守卫（E1）。
 *
 * 面板→中心移动标签时，两宿主的 lifecycle effect 都会跑：面板把刚移走的旧活动
 * 标签隐藏（移出屏幕），中心把同一 WebView 显示出来。谁后跑谁赢 —— 若面板的
 * 隐藏后跑，就会盖掉中心的显示，中心视图空白。反向（中心→面板）同理。
 *
 * 隐藏前必须确认该 tab 当前仍归属本宿主（`location` 判定：`'center'` 归中心，
 * 其余归面板），否则跳过。store 在 effects 之前已更新，所以读到的归属是最新的，
 * 与 effect 跑序无关：无论面板先跑还是后跑，最终都是中心的显示胜出。
 *
 * @param hostId 发起隐藏的宿主
 * @param tab store 中该 tab 的最新快照；undefined（已删除）时返回 true ——
 * 残留表面必须隐藏，不能因查不到归属而留下。
 */
export function shouldHostHideTab(
  hostId: BrowserHostId,
  tab: { location?: 'panel' | 'center' } | undefined,
): boolean {
  if (!tab) {
    return true;
  }
  return hostId === 'center' ? tab.location === 'center' : tab.location !== 'center';
}

let poolSet = new Set<string>();
/** Tabs whose WebView creation is currently in flight — guards against
 *  duplicate concurrent creation for the same tab (URL canonicalization can
 *  refire the lifecycle effect before the async create completes). */
let creatingSet = new Set<string>();
let version = 0;
const listeners = new Set<PoolListener>();

function bump(): void {
  version += 1;
  for (const listener of listeners) {
    listener();
  }
}

function addToPool(tabId: string): void {
  poolSet.add(tabId);
}

function removeFromPoolInternal(tabId: string): void {
  poolSet.delete(tabId);
}

async function createForTab(
  tabId: string,
  url: string,
  colorScheme?: 'light' | 'dark',
  location?: 'panel' | 'center',
): Promise<string | null> {
  if (creatingSet.has(tabId)) {
    return null;
  }
  if (poolSet.has(tabId)) {
    return null;
  }
  creatingSet.add(tabId);
  let rustEvicted: string | null = null;
  try {
    if (isTauriShell()) {
      const bridge = window.digitalLife?.browser;
      if (bridge) {
        rustEvicted = await bridge.createForTab(tabId, url, colorScheme, location);
        // 新建原生子窗口盖在最上层，通知透明桥接条重建回到最上层。
        useAppStore.getState().bumpSiblingWebviewNonce();
      }
    }

    // Remove Rust-returned evicted tab
    if (rustEvicted) {
      removeFromPoolInternal(rustEvicted);
    }

    // Add new tab
    addToPool(tabId);

    bump();

    return rustEvicted;
  } finally {
    creatingSet.delete(tabId);
  }
}

async function activateTab(tabId: string): Promise<void> {
  if (isTauriShell()) {
    const bridge = window.digitalLife?.browser;
    if (bridge) {
      await bridge.activateTab(tabId);
    }
  }
}

async function navigateTab(tabId: string, url: string): Promise<void> {
  if (isTauriShell()) {
    const bridge = window.digitalLife?.browser;
    if (bridge) {
      await bridge.navigateTab(tabId, url);
    }
  }
}

async function destroyTab(tabId: string): Promise<void> {
  // F-M2：先同步从池中移除（isTabInPool 立即 false、emit），
  // 再 await 后端 destroy。否则"destroy 在途用户重激活 → isTabInPool 仍 true →
  // 创建被跳过 → tab 空白"的竞态。若 destroy 失败则回滚重新加入池。
  removeFromPoolInternal(tabId);
  bump();
  if (isTauriShell()) {
    const bridge = window.digitalLife?.browser;
    if (bridge) {
      try {
        await bridge.destroyTab(tabId);
      } catch (e) {
        console.warn('destroyTab failed, re-adding tab to pool:', e);
        addToPool(tabId);
        bump();
      }
    }
  }
}

export const browserPool = {
  isTabInPool(tabId: string): boolean {
    return poolSet.has(tabId);
  },
  getSize(): number {
    return poolSet.size;
  },
  createForTab,
  activateTab,
  navigateTab,
  destroyTab,
  subscribe(listener: PoolListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getVersion(): number {
    return version;
  },
  reset(): void {
    // test-only：清空池成员与版本监听。生产代码不得调用（单例状态全局共享）。
    poolSet = new Set();
    creatingSet = new Set();
    version = 0;
    listeners.clear();
  },
};
