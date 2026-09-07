# OverlayManager 集中式悬浮层检测 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 WebView2 悬浮层检测从分散的 MutationObserver 重构为集中式 OverlayManager 单例，消除浏览器面板与 DSH 面板的重复代码，并让 DSH WebView2 在悬浮层出现时自动移出屏幕。

**Architecture:** 创建 `OverlayManager` 单例，维护单一 `MutationObserver` 监听 `document.body`，所有 WebView2 容器（browser tabs + DSH）通过订阅机制注册自己的容器元素。Manager 负责悬浮层选择器维护、DOM 变更检测、几何重叠判断，订阅者收到通知后自行决定 hide/show 行为。

**Tech Stack:** TypeScript, React hooks, MutationObserver API, Tauri WebView2 bounds IPC

**Spec:** 本计划基于方案 B（集中式 OverlayManager 服务）设计，无独立 spec 文件。

---

## 文件结构

| 操作 | 文件路径 | 职责 |
|------|----------|------|
| **Create** | `frontend/src/shared/overlayManager.ts` | OverlayManager 单例：选择器维护、MutationObserver、重叠检测、订阅者管理 |
| **Modify** | `frontend/src/app/features/browser/useWebViewVisibility.ts` | 移除内联 MutationObserver，改为订阅 OverlayManager |
| **Create** | `frontend/src/app/features/dsh/useDshWebViewVisibility.ts` | DSH 专用可见性 Hook：订阅 OverlayManager + overlayActive 状态 |
| **Modify** | `frontend/src/app/features/dsh/useDshWebViewBounds.ts` | 移除职责越界的 overlay 逻辑（如有），纯化为 bounds hook |
| **Modify** | `frontend/src/app/features/dsh/DshHostRegion.tsx` | 组合 useDshWebViewBounds + useDshWebViewVisibility |
| **Modify** | `frontend/src/app/features/browser/__tests__/useWebViewVisibility.test.ts` | 更新测试：断言 OverlayManager 被使用 |
| **Create** | `frontend/src/shared/__tests__/overlayManager.test.ts` | OverlayManager 单元测试 |

---

## Task 1: Create OverlayManager Singleton

**Files:**
- Create: `frontend/src/shared/overlayManager.ts`

**Interfaces:**
- Consumes: 无外部依赖
- Produces: `getOverlayManager()` 返回单例，暴露 `subscribe()`, `checkOverlap()`, `getSelector()`

- [ ] **Step 1: Create OverlayManager module**

```typescript
// frontend/src/shared/overlayManager.ts

/**
 * 悬浮层选择器：所有需要与 WebView2 HWND 做重叠检测的 DOM 元素。
 * 新增悬浮层只需在此数组追加选择器，所有订阅者自动受益。
 */
const OVERLAY_SELECTORS = [
  '.adl-sidebar-menu',
  '.adl-multitree-entry__menu',
  '.adl-menu__dropdown',
  '.adl-search-engine-popover',
  '.adl-download-menu',
  '.adl-confirm-overlay',
] as const;

export const WEBVIEW_OVERLAY_SELECTOR = OVERLAY_SELECTORS.join(', ');

type SubscriberCallback = (isOverlapped: boolean) => void;

interface Subscriber {
  container: HTMLElement;
  callback: SubscriberCallback;
}

/**
 * 集中式悬浮层检测管理器（单例）。
 *
 * 解决 WebView2 HWND 永远绘制在 DOM 之上的问题：当 HTML 悬浮层（菜单、下拉、
 * 对话框等）与 WebView2 容器区域几何重叠时，通知订阅者将原生 WebView 移出屏幕。
 *
 * 所有 WebView2 实例（browser tabs、DSH 等）共享此单例，消除重复的
 * MutationObserver 和选择器维护。
 */
class OverlayManagerClass {
  private observer: MutationObserver | null = null;
  private rafId: number | null = null;
  private subscribers: Set<Subscriber> = new Set();
  private selector = WEBVIEW_OVERLAY_SELECTOR;

  /**
   * 订阅悬浮层检测。
   * @param container - 需要保护的 DOM 容器元素（WebView2 定位参照）
   * @param callback - 重叠状态变化时的回调，参数为 isOverlapped
   * @returns unsubscribe 函数
   */
  subscribe(container: HTMLElement, callback: SubscriberCallback): () => void {
    const sub: Subscriber = { container, callback };
    this.subscribers.add(sub);

    // 首个订阅者加入时启动 MutationObserver
    if (this.subscribers.size === 1) {
      this.startObserver();
    }

    // 首次订阅立即做一次重叠检查
    const overlaps = this.checkOverlap(container);
    callback(overlaps);

    return () => {
      this.subscribers.delete(sub);
      // 最后一个订阅者离开时停止 MutationObserver
      if (this.subscribers.size === 0) {
        this.stopObserver();
      }
    };
  }

  /**
   * 检查指定容器是否与任何悬浮层重叠。
   */
  checkOverlap(container: HTMLElement): boolean {
    const overlays = document.querySelectorAll(this.selector);
    if (overlays.length === 0) return false;

    const containerRect = container.getBoundingClientRect();

    for (const el of overlays) {
      const overlayRect = el.getBoundingClientRect();
      if (
        overlayRect.left < containerRect.right &&
        overlayRect.right > containerRect.left &&
        overlayRect.top < containerRect.bottom &&
        overlayRect.bottom > containerRect.top
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * 获取当前悬浮层选择器（供测试或动态扩展使用）。
   */
  getSelector(): string {
    return this.selector;
  }

  private scheduleCheck = () => {
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.notifySubscribers();
    });
  };

  private notifySubscribers() {
    for (const sub of this.subscribers) {
      const overlaps = this.checkOverlap(sub.container);
      sub.callback(overlaps);
    }
  }

  private startObserver() {
    if (this.observer) return;
    this.observer = new MutationObserver(this.scheduleCheck);
    this.observer.observe(document.body, { childList: true, subtree: true });
    // 初始检查一次
    this.notifySubscribers();
  }

  private stopObserver() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}

// 单例
let instance: OverlayManagerClass | null = null;

export function getOverlayManager(): OverlayManagerClass {
  if (!instance) {
    instance = new OverlayManagerClass();
  }
  return instance;
}
```

- [ ] **Step 2: Verify file compiles**

Run: `cd frontend && npx tsc --noEmit --strict src/shared/overlayManager.ts`
Expected: no errors (or only env-related errors from standalone check)

---

## Task 2: Write OverlayManager Unit Tests

**Files:**
- Create: `frontend/src/shared/__tests__/overlayManager.test.ts`

**Interfaces:**
- Consumes: `OverlayManagerClass`, `WEBVIEW_OVERLAY_SELECTOR` from Task 1
- Produces: 测试覆盖核心逻辑

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getOverlayManager, WEBVIEW_OVERLAY_SELECTOR } from '../overlayManager';

describe('OverlayManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    // 清理 DOM
    document.body.innerHTML = '';
  });

  it('WEBVIEW_OVERLAY_SELECTOR 包含所有已知悬浮层选择器', () => {
    expect(WEBVIEW_OVERLAY_SELECTOR).toContain('.adl-sidebar-menu');
    expect(WEBVIEW_OVERLAY_SELECTOR).toContain('.adl-multitree-entry__menu');
    expect(WEBVIEW_OVERLAY_SELECTOR).toContain('.adl-menu__dropdown');
    expect(WEBVIEW_OVERLAY_SELECTOR).toContain('.adl-search-engine-popover');
    expect(WEBVIEW_OVERLAY_SELECTOR).toContain('.adl-download-menu');
    expect(WEBVIEW_OVERLAY_SELECTOR).toContain('.adl-confirm-overlay');
  });

  it('subscribe 首次调用立即执行一次回调', () => {
    const manager = getOverlayManager();
    const container = document.createElement('div');
    container.getBoundingClientRect = () => ({
      left: 0, top: 0, right: 100, bottom: 100,
      width: 100, height: 100, x: 0, y: 0, toJSON: () => {},
    });
    document.body.appendChild(container);

    const callback = vi.fn();
    manager.subscribe(container, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(false); // 无悬浮层，不重叠
  });

  it('当悬浮层与容器重叠时回调 true', () => {
    const manager = getOverlayManager();
    const container = document.createElement('div');
    container.getBoundingClientRect = () => ({
      left: 0, top: 0, right: 100, bottom: 100,
      width: 100, height: 100, x: 0, y: 0, toJSON: () => {},
    });
    document.body.appendChild(container);

    // 创建一个匹配选择器的悬浮层，且与容器重叠
    const overlay = document.createElement('div');
    overlay.className = 'adl-sidebar-menu';
    overlay.getBoundingClientRect = () => ({
      left: 50, top: 50, right: 150, bottom: 150,
      width: 100, height: 100, x: 50, y: 50, toJSON: () => {},
    });
    document.body.appendChild(overlay);

    const callback = vi.fn();
    manager.subscribe(container, callback);

    expect(callback).toHaveBeenCalledWith(true);
  });

  it('unsubscribe 后不再收到回调', () => {
    const manager = getOverlayManager();
    const container = document.createElement('div');
    container.getBoundingClientRect = () => ({
      left: 0, top: 0, right: 100, bottom: 100,
      width: 100, height: 100, x: 0, y: 0, toJSON: () => {},
    });
    document.body.appendChild(container);

    const callback = vi.fn();
    const unsub = manager.subscribe(container, callback);
    unsub();

    // 添加新悬浮层触发 MutationObserver
    const overlay = document.createElement('div');
    overlay.className = 'adl-menu__dropdown';
    document.body.appendChild(overlay);

    // callback 不应再被调用（除了初始的那次）
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('checkOverlap 在无悬浮层时返回 false', () => {
    const manager = getOverlayManager();
    const container = document.createElement('div');
    container.getBoundingClientRect = () => ({
      left: 0, top: 0, right: 100, bottom: 100,
      width: 100, height: 100, x: 0, y: 0, toJSON: () => {},
    });

    expect(manager.checkOverlap(container)).toBe(false);
  });

  it('getSelector 返回完整选择器字符串', () => {
    const manager = getOverlayManager();
    const selector = manager.getSelector();
    expect(selector.split(',').every((s) => s.trim().startsWith('.'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd frontend && npx vitest run src/shared/__tests__/overlayManager.test.ts`
Expected: all tests pass

---

## Task 3: Refactor useWebViewVisibility to Use OverlayManager

**Files:**
- Modify: `frontend/src/app/features/browser/useWebViewVisibility.ts`

**Interfaces:**
- Consumes: `getOverlayManager()` from Task 1
- Produces: `hideAllWebViews`, `useWebViewVisibility` (same API, internal implementation changed)

**Changes:**
- Remove inline `MutationObserver` effect (lines 84-151)
- Remove exported `WEBVIEW_OVERLAY_SELECTOR` (moved to OverlayManager)
- Add OverlayManager subscription in a new effect
- Keep `overlayActive` state-driven effect and visibility effect unchanged

- [ ] **Step 1: Refactor the hook**

Remove the `WEBVIEW_OVERLAY_SELECTOR` export and the inline MutationObserver effect. Replace with OverlayManager subscription:

```typescript
// frontend/src/app/features/browser/useWebViewVisibility.ts
import { useCallback, useEffect } from 'react';
import { isTauriShell } from '@shared/env';
import { getOverlayManager } from '@shared/overlayManager';
import type { BrowserTabState } from '@stores/slices/browserSlice';

const HIDDEN_WEBVIEW_OFFSCREEN_COORD = 32767;

// Re-export for backward compatibility (tests may import this)
export { WEBVIEW_OVERLAY_SELECTOR } from '@shared/overlayManager';

interface UseWebViewVisibilityOptions {
  isVisible: boolean;
  overlayActive: boolean;
  isTabInPool: (tabId: string) => boolean;
  primaryRef: React.RefObject<HTMLDivElement | null>;
  webViewActiveRef: React.RefObject<boolean>;
  hideWebViewRequestedRef: React.RefObject<boolean>;
  overlayActiveRef: React.RefObject<boolean>;
  activeTabRef: React.RefObject<BrowserTabState | undefined>;
  updateWebViewBounds: () => void;
  updateWebViewBoundsRef: React.RefObject<() => void>;
}

export function useWebViewVisibility(options: UseWebViewVisibilityOptions) {
  const {
    isVisible,
    overlayActive,
    isTabInPool,
    primaryRef,
    webViewActiveRef,
    hideWebViewRequestedRef,
    overlayActiveRef,
    activeTabRef,
    updateWebViewBounds,
    updateWebViewBoundsRef,
  } = options;

  const hideAllWebViews = useCallback(() => {
    if (!isTauriShell()) return;
    const tab = activeTabRef.current;
    if (tab && isTabInPool(tab.id)) {
      window.digitalLife?.browser
        ?.setTabBounds(tab.id, { x: -10000, y: -10000, width: 1, height: 1 })
        .catch((err) => console.warn('webview overlay hide set bounds failed', err));
    }
  }, [isTabInPool, activeTabRef]);

  // OverlayManager subscription — replaces inline MutationObserver
  useEffect(() => {
    if (!isTauriShell() || !primaryRef.current) return;

    const manager = getOverlayManager();
    const unsub = manager.subscribe(primaryRef.current, (hasOverlap) => {
      if (hasOverlap === hideWebViewRequestedRef.current) return;
      hideWebViewRequestedRef.current = hasOverlap;

      if (!webViewActiveRef.current) return;

      if (hasOverlap) {
        hideAllWebViews();
      } else if (!overlayActiveRef.current) {
        updateWebViewBoundsRef.current();
      }
    });

    return unsub;
  }, [
    hideAllWebViews,
    hideWebViewRequestedRef,
    overlayActiveRef,
    primaryRef,
    updateWebViewBoundsRef,
    webViewActiveRef,
  ]);

  // Overlay state-driven hide (unchanged)
  useEffect(() => {
    if (!isTauriShell() || !webViewActiveRef.current) return;
    if (overlayActive) {
      hideAllWebViews();
    } else {
      updateWebViewBounds();
    }
  }, [overlayActive, hideAllWebViews, updateWebViewBounds, webViewActiveRef]);

  // Visibility change (unchanged)
  useEffect(() => {
    if (!isTauriShell() || !webViewActiveRef.current) return;
    if (isVisible && !hideWebViewRequestedRef.current) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => updateWebViewBounds());
      });
    } else if (!isVisible) {
      const tab = activeTabRef.current;
      if (tab && isTabInPool(tab.id)) {
        window.digitalLife?.browser
          ?.setTabBounds(tab.id, {
            x: HIDDEN_WEBVIEW_OFFSCREEN_COORD,
            y: HIDDEN_WEBVIEW_OFFSCREEN_COORD,
            width: 1,
            height: 1,
          })
          .catch((err) => console.warn('webview visibility-change hide failed', err));
      }
    }
  }, [
    isVisible,
    updateWebViewBounds,
    isTabInPool,
    activeTabRef,
    hideWebViewRequestedRef,
    webViewActiveRef,
  ]);
}
```

- [ ] **Step 2: Run existing tests to verify no regression**

Run: `cd frontend && npx vitest run src/app/features/browser/__tests__/useWebViewVisibility.test.ts`
Expected: PASS (tests import `WEBVIEW_OVERLAY_SELECTOR` from re-export)

- [ ] **Step 3: Run full browser feature tests**

Run: `cd frontend && npx vitest run src/app/features/browser/`
Expected: all tests pass

---

## Task 4: Create useDshWebViewVisibility Hook

**Files:**
- Create: `frontend/src/app/features/dsh/useDshWebViewVisibility.ts`

**Interfaces:**
- Consumes: `getOverlayManager()` from Task 1
- Produces: `useDshWebViewVisibility({ containerRef, isVisible, overlayActive })` — 订阅 OverlayManager 并管理 DSH WebView2 的 hide/show

- [ ] **Step 1: Create the hook**

```typescript
// frontend/src/app/features/dsh/useDshWebViewVisibility.ts
import { useEffect, useRef } from 'react';
import { isTauriShell } from '@shared/env';
import { getOverlayManager } from '@shared/overlayManager';

interface UseDshWebViewVisibilityOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  isVisible: boolean;
  /** 状态驱动的 overlay（如 CloseDshDialog） */
  overlayActive: boolean;
}

/**
 * DSH WebView 可见性 Hook：负责悬浮层重叠检测与 hide/show 控制。
 *
 * 双路检测：
 * - DOM 悬浮层：通过 OverlayManager 订阅，自动检测菜单/下拉等与 DSH 容器的重叠
 * - 状态 overlay：由 overlayActive prop 驱动（如 CloseDshDialog）
 *
 * 当任一检测路径触发时，将 DSH 原生 WebView2 移出屏幕；恢复时重新同步 bounds。
 */
export function useDshWebViewVisibility(options: UseDshWebViewVisibilityOptions) {
  const { containerRef, isVisible, overlayActive } = options;

  const hideRequestedRef = useRef(false);
  const activeRef = useRef(false);
  const overlayActiveRef = useRef(overlayActive);
  overlayActiveRef.current = overlayActive;

  // OverlayManager subscription — DOM-based overlay detection
  useEffect(() => {
    if (!isTauriShell() || !containerRef.current) return;

    const manager = getOverlayManager();
    const unsub = manager.subscribe(containerRef.current, (hasOverlap) => {
      if (hasOverlap === hideRequestedRef.current) return;
      hideRequestedRef.current = hasOverlap;

      if (!activeRef.current) return;

      if (hasOverlap) {
        hideDshWebView();
      } else if (!overlayActiveRef.current) {
        restoreDshWebView();
      }
    });

    return unsub;
  }, [containerRef]);

  // State-driven overlay (e.g. CloseDshDialog)
  useEffect(() => {
    if (!isTauriShell() || !activeRef.current) return;
    if (overlayActive) {
      hideDshWebView();
    } else if (!hideRequestedRef.current) {
      restoreDshWebView();
    }
  }, [overlayActive]);

  // Visibility change
  useEffect(() => {
    if (!isTauriShell()) return;
    if (isVisible && !hideRequestedRef.current) {
      activeRef.current = true;
      // 双 rAF 确保 DOM 布局稳定后再恢复
      requestAnimationFrame(() => {
        requestAnimationFrame(() => restoreDshWebView());
      });
    } else if (!isVisible) {
      activeRef.current = false;
      hideDshWebView();
    }
  }, [isVisible]);

  function hideDshWebView() {
    window.digitalLife?.browser
      ?.setDshBounds({ x: -10000, y: -10000, width: 1, height: 1 })
      .catch((err) => console.warn('dsh overlay hide failed', err));
  }

  function restoreDshWebView() {
    // 由 useDshWebViewBounds 的 ResizeObserver 触发 restore，
    // 此处仅在 overlay 消失时主动触发一次
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    window.digitalLife?.browser
      ?.setDshBounds({
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      })
      .catch((err) => console.warn('dsh overlay restore failed', err));
  }

  // 暴露 refs 供外部读取
  return { hideRequestedRef, activeRef };
}
```

- [ ] **Step 2: Verify file compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: no type errors

---

## Task 5: Update DshHostRegion to Compose Visibility Hook

**Files:**
- Modify: `frontend/src/app/features/dsh/DshHostRegion.tsx`

**Interfaces:**
- Consumes: `useDshWebViewVisibility` from Task 4, `useDshWebViewBounds` (existing)
- Produces: DSH host region with full overlay protection

**Changes:**
- Import `useDshWebViewVisibility`
- Track `closeDialogOpen` state for the CloseDshDialog
- Pass `containerRef` and visibility state to both hooks

- [ ] **Step 1: Update DshHostRegion**

```typescript
// frontend/src/app/features/dsh/DshHostRegion.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { isTauriShell } from '@shared/env';
import { useDshWebViewBounds } from './useDshWebViewBounds';
import { useDshWebViewVisibility } from './useDshWebViewVisibility';

export function DshHostRegion() {
  const { t } = useTCopy();
  const url = useAppStore((s) => s.url);
  const isTauri = useMemo(() => isTauriShell(), []);
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const loadDetected = useRef(false);
  const { containerRef, updateBounds } = useDshWebViewBounds();

  // CloseDshDialog 的 overlay 状态（状态驱动的 overlay）
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);

  // DSH 可见性管理：订阅 OverlayManager + 状态 overlay
  useDshWebViewVisibility({
    containerRef,
    isVisible: isTauri && !!url,
    overlayActive: closeDialogOpen,
  });

  const handleOpenExternal = useCallback(() => {
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, [url]);

  // Tauri 模式：挂载后立即同步一次精确 bounds
  useEffect(() => {
    if (isTauri && url) {
      updateBounds();
    }
  }, [isTauri, url, updateBounds]);

  // iframe blocked detection (unchanged)
  useEffect(() => {
    if (!url || isTauri || iframeBlocked) return;
    const timer = setTimeout(() => {
      if (loadDetected.current) return;
      setIframeBlocked(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, [url, isTauri, iframeBlocked]);

  const handleIframeLoad = useCallback(() => {
    loadDetected.current = true;
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument;
      if (!doc || !doc.body || doc.body.innerHTML === '') {
        setIframeBlocked(true);
      }
    } catch {
      setIframeBlocked(true);
    }
  }, []);

  if (!url) {
    return (
      <section className="adl-center adl-center--dsh-placeholder">
        <div className="adl-center__body adl-center__body--empty">
          <div className="adl-center__empty">{t.dshWelcomeEmpty}</div>
        </div>
      </section>
    );
  }

  if (isTauri) {
    return (
      <section
        ref={containerRef}
        id="dsh-host-region"
        className="adl-app-host"
        data-shell="tauri"
        aria-label={t.dshTitle}
      />
    );
  }

  if (iframeBlocked) {
    return (
      <section className="adl-app-host" data-shell="browser-fallback" aria-label={t.dshTitle}>
        <div className="adl-app-host__fallback">
          <svg
            className="adl-app-host__fallback-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
          <h3 className="adl-app-host__fallback-title">{t.dshOpenExternal}</h3>
          <p className="adl-app-host__fallback-desc">{t.dshWelcomeEmpty}</p>
          <button type="button" className="adl-btn adl-btn--primary" onClick={handleOpenExternal}>
            {t.dshOpenExternal}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="adl-app-host" data-shell="browser" aria-label={t.dshTitle}>
      <iframe
        ref={iframeRef}
        src={url}
        title={t.dshTitle}
        className="adl-app-host__frame"
        onLoad={handleIframeLoad}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
    </section>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no type errors

---

## Task 6: Update Browser Tests

**Files:**
- Modify: `frontend/src/app/features/browser/__tests__/useWebViewVisibility.test.ts`

**Changes:**
- Update imports to use re-exported `WEBVIEW_OVERLAY_SELECTOR`
- Add test verifying OverlayManager integration

- [ ] **Step 1: Update test file**

```typescript
// frontend/src/app/features/browser/__tests__/useWebViewVisibility.test.ts
import { describe, expect, it } from 'vitest';
// WEBVIEW_OVERLAY_SELECTOR is re-exported from useWebViewVisibility for backward compat
import { WEBVIEW_OVERLAY_SELECTOR } from '../useWebViewVisibility';

describe('WEBVIEW_OVERLAY_SELECTOR', () => {
  it('包含确认对话框遮罩，避免确认框被 WebView 覆盖', () => {
    expect(WEBVIEW_OVERLAY_SELECTOR).toContain('.adl-confirm-overlay');
  });

  it('保留既有的菜单/下拉等悬浮层选择器', () => {
    expect(WEBVIEW_OVERLAY_SELECTOR).toContain('.adl-sidebar-menu');
    expect(WEBVIEW_OVERLAY_SELECTOR).toContain('.adl-multitree-entry__menu');
    expect(WEBVIEW_OVERLAY_SELECTOR).toContain('.adl-menu__dropdown');
    expect(WEBVIEW_OVERLAY_SELECTOR).toContain('.adl-search-engine-popover');
    expect(WEBVIEW_OVERLAY_SELECTOR).toContain('.adl-download-menu');
  });

  it('选择器以逗号分隔拼接成合法的 querySelectorAll 输入', () => {
    expect(WEBVIEW_OVERLAY_SELECTOR.split(',').every((s) => s.trim().startsWith('.'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd frontend && npx vitest run src/app/features/browser/__tests__/useWebViewVisibility.test.ts`
Expected: PASS

---

## Task 7: Clean Up useDshWebViewBounds

**Files:**
- Modify: `frontend/src/app/features/dsh/useDshWebViewBounds.ts`

**Changes:**
- 移除可能存在的 overlay 相关逻辑（当前代码无此问题，确认纯净）
- 确保只负责 ResizeObserver + bounds 同步
- 添加 JSDoc 注释明确职责边界

- [ ] **Step 1: Verify current code is already clean**

Read `frontend/src/app/features/dsh/useDshWebViewBounds.ts` — confirm it only handles ResizeObserver + setDshBounds. No changes needed if already clean.

- [ ] **Step 2: Add clarifying JSDoc**

```typescript
/**
 * DSH WebView 边界同步 Hook：监听 DSH host 容器尺寸变化，将精确 bounds
 * 同步到后端原生 WebView2 子窗口。
 *
 * 职责（单一）：
 * - ResizeObserver 监听容器尺寸变化
 * - getBoundingClientRect 读取精确坐标
 * - 调用 browser_set_dsh_bounds IPC 更新原生 WebView 位置
 *
 * 不负责：悬浮层检测与 hide/show 控制（由 useDshWebViewVisibility 处理）
 */
```

---

## Task 8: Full Integration Test

**Files:**
- No new files

- [ ] **Step 1: Run full frontend type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no type errors

- [ ] **Step 2: Run full frontend lint**

Run: `cd frontend && npx eslint .`
Expected: no errors

- [ ] **Step 3: Run all frontend tests**

Run: `cd frontend && npx vitest run`
Expected: all tests pass

- [ ] **Step 4: Run build to verify no bundling issues**

Run: `cd frontend && npx vite build`
Expected: build succeeds

---

## Task 9: Commit

- [ ] **Step 1: Stage all changes**

```bash
git add frontend/src/shared/overlayManager.ts \
        frontend/src/shared/__tests__/overlayManager.test.ts \
        frontend/src/app/features/browser/useWebViewVisibility.ts \
        frontend/src/app/features/browser/__tests__/useWebViewVisibility.test.ts \
        frontend/src/app/features/dsh/useDshWebViewVisibility.ts \
        frontend/src/app/features/dsh/DshHostRegion.tsx \
        frontend/src/app/features/dsh/useDshWebViewBounds.ts
```

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(overlay): centralized OverlayManager for WebView2 floating layer detection

- Create OverlayManager singleton with single MutationObserver
- Refactor useWebViewVisibility to subscribe to OverlayManager
- Add useDshWebViewVisibility hook for DSH WebView2 overlay protection
- DshHostRegion now hides DSH WebView when floating layers overlap
- All WebView2 instances share one observer, new overlays only need selector update"
```
