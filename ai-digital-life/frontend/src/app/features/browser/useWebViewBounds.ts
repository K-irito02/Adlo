import { useCallback, useEffect, useRef } from 'react';
import { isTauriShell } from '@tauri-bridge';
import type { BrowserTabState } from '@stores/slices/browserSlice';

interface UseWebViewBoundsOptions {
  webViewDisabled: boolean;
  isVisible: boolean;
  isTabInPool: (tabId: string) => boolean;
  activeTabRef: React.RefObject<BrowserTabState | undefined>;
  overlayActiveRef: React.RefObject<boolean>;
  webViewActiveRef: React.RefObject<boolean>;
  hideWebViewRequestedRef: React.RefObject<boolean>;
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
    // Don't restore webview position while an overlay (dialog/menu) is active
    if (overlayActiveRef.current) {
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

    window.digitalLife?.browser?.setTabBounds(tab.id, bounds).catch(() => {});
  }, [isTabInPool, webViewDisabled, activeTabRef, overlayActiveRef]);

  const updateWebViewBoundsRef = useRef(updateWebViewBounds);
  useEffect(() => {
    updateWebViewBoundsRef.current = updateWebViewBounds;
  }, [updateWebViewBounds]);

  // ResizeObserver
  useEffect(() => {
    if (!isTauriShell() || !primaryRef.current) {
      return;
    }

    const observer = new ResizeObserver(() => {
      if (webViewActiveRef.current && isVisible && !hideWebViewRequestedRef.current) {
        updateWebViewBounds();
      }
    });
    observer.observe(primaryRef.current);

    return () => observer.disconnect();
  }, [updateWebViewBounds, isVisible, webViewActiveRef, hideWebViewRequestedRef]);

  return {
    primaryRef,
    updateWebViewBounds,
    updateWebViewBoundsRef,
  };
}
