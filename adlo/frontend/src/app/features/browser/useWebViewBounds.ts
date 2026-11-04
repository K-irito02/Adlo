import { useCallback, useEffect, useRef } from 'react';
import { isTauriShell } from '@shared/env';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import { isRevealPending } from './browserRevealGate';

interface UseWebViewBoundsOptions {
  webViewDisabled: boolean;
  isVisible: boolean;
  isTabInPool: (tabId: string) => boolean;
  activeTabRef: React.RefObject<BrowserTabState | undefined>;
  overlayActiveRef: React.RefObject<boolean>;
  webViewActiveRef: React.RefObject<boolean>;
  hideWebViewRequestedRef: React.RefObject<boolean>;
  /**
   * 可选：面板缩放动画容器选择器。仅面板宿主传入 `.adl-rightpanel__content`
   * 时，在面板可见时重置其 transform（消除 CSS 过渡延迟导致的 rect 偏移）。
   * 中心宿主不传 —— 无对应容器，行为不变。
   */
  contentSelector?: string;
}

/**
 * WebView 边界计算 Hook：负责根据 primaryRef 容器的几何位置计算并应用 WebView 边界。
 *
 * 职责：
 * - updateWebViewBounds：读取容器 rect 并调用 setTabBounds 同步位置
 * - updateWebViewBoundsRef：保持最新引用，供 MutationObserver 回调避免过期闭包
 * - ResizeObserver：监听容器尺寸变化时重新应用边界
 * - 持有 primaryRef（返回给消费者作为容器 ref）
 */
export function useWebViewBounds(options: UseWebViewBoundsOptions) {
  const {
    webViewDisabled,
    isVisible,
    isTabInPool,
    activeTabRef,
    overlayActiveRef,
    webViewActiveRef,
    hideWebViewRequestedRef,
    contentSelector,
  } = options;

  const primaryRef = useRef<HTMLDivElement | null>(null);

  const updateWebViewBounds = useCallback(() => {
    if (!primaryRef.current || !isTauriShell()) {
      return;
    }
    const tab = activeTabRef.current;
    if (!tab || !isTabInPool(tab.id)) {
      return;
    }
    if (webViewDisabled) {
      return;
    }
    // Don't restore webview position while an overlay (dialog/menu) is active —
    // neither React state overlays nor DOM-detected overlays (hide requested).
    if (overlayActiveRef.current) {
      return;
    }
    if (hideWebViewRequestedRef.current) {
      return;
    }
    // 首帧揭示门控：新建 WebView2 在页面就绪前保持屏外，避免空白首帧闪烁。
    if (isRevealPending(tab.id)) {
      return;
    }

    const rect = primaryRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    const bounds = {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };

    window.digitalLife?.browser?.setTabBounds(tab.id, bounds).catch((err) => {
      console.warn('webview set bounds failed', err);
    });
  }, [isTabInPool, webViewDisabled, activeTabRef, overlayActiveRef, hideWebViewRequestedRef]);

  const updateWebViewBoundsRef = useRef(updateWebViewBounds);
  useEffect(() => {
    updateWebViewBoundsRef.current = updateWebViewBounds;
  }, [updateWebViewBounds]);

  // ResizeObserver + window resize fallback
  useEffect(() => {
    if (!isTauriShell() || !primaryRef.current) {
      return;
    }

    // Reset content transform immediately when the host becomes visible.
    // The CSS transition on the panel content container has a delay that causes
    // getBoundingClientRect() to return the pre-expansion offset position.
    // Force transform to 0 so WebView2 bounds are based on the final layout.
    // Only the panel host supplies `contentSelector`; the center host has no
    // such animated ancestor and skips this reset.
    let rafId: number | undefined;
    if (isVisible) {
      const content = contentSelector
        ? (primaryRef.current.closest(contentSelector) as HTMLElement | null)
        : null;
      if (content) {
        content.style.transform = 'translateX(0)';
      }
      rafId = requestAnimationFrame(() => updateWebViewBounds());
    }

    const handleUpdate = () => {
      if (
        webViewActiveRef.current &&
        isVisible &&
        !overlayActiveRef.current &&
        !hideWebViewRequestedRef.current
      ) {
        updateWebViewBounds();
      }
    };

    const observer = new ResizeObserver(handleUpdate);
    observer.observe(primaryRef.current);

    const onWindowResize = () => handleUpdate();
    window.addEventListener('resize', onWindowResize);

    return () => {
      if (rafId !== undefined) {
        cancelAnimationFrame(rafId);
      }
      observer.disconnect();
      window.removeEventListener('resize', onWindowResize);
    };
  }, [
    updateWebViewBounds,
    isVisible,
    webViewActiveRef,
    overlayActiveRef,
    hideWebViewRequestedRef,
    contentSelector,
  ]);

  return {
    primaryRef,
    updateWebViewBounds,
    updateWebViewBoundsRef,
  };
}
