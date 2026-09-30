import { useCallback, useEffect, useRef } from 'react';
import { isTauriShell } from '@shared/env';
import { getOverlayManager } from '@shared/overlayManager';

/**
 * Offscreen coordinate used to hide the DSH WebView by moving it far outside
 * the viewport. `32767` is `Int16.MAX_VALUE` — WebView2 treats this as "way
 * offscreen" without unloading the page (preserves SPA state).
 */
const HIDDEN_WEBVIEW_OFFSCREEN_COORD = 32767;

interface UseDshWebViewVisibilityOptions {
  isVisible: boolean;
  overlayActive: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  updateBounds: () => void;
  /** 外部共享的隐藏守卫（可选）：传入时 bounds 侧可同步读取，避免 resize 拉回已隐藏的 WebView */
  hideRequestedRef?: React.RefObject<boolean>;
}

/**
 * DSH WebView 可见性 Hook：负责 overlay 检测与可见性驱动的隐藏/恢复。
 *
 * DSH 面板运行在独立 WebView2 子窗口中，当浮动层出现时需要主动移出画面，
 * 避免 DSH WebView2 覆盖菜单/弹出层。
 *
 * 三条检测路径：
 * - DOM overlay：委托 OverlayManager 单例监听菜单元素与容器的重叠
 * - State overlay：外部传入 overlayActive 状态
 * - 可见性变化：外部传入 isVisible 状态
 */
export function useDshWebViewVisibility(options: UseDshWebViewVisibilityOptions) {
  const { isVisible, overlayActive, containerRef, updateBounds } = options;

  const internalHideRequestedRef = useRef(false);
  const hideRequestedRef = options.hideRequestedRef ?? internalHideRequestedRef;
  const activeRef = useRef(false);
  const overlayActiveRef = useRef(overlayActive);

  useEffect(() => {
    overlayActiveRef.current = overlayActive;
  }, [overlayActive]);

  // Sync activeRef with isVisible — mirrors useWebViewLifecycle setting
  // webViewActiveRef.current = true after WebView activation
  useEffect(() => {
    activeRef.current = isVisible;
  }, [isVisible]);

  const hideDshWebView = useCallback(() => {
    if (!isTauriShell()) {
      return;
    }
    window.digitalLife?.browser
      ?.setDshBounds({
        x: HIDDEN_WEBVIEW_OFFSCREEN_COORD,
        y: HIDDEN_WEBVIEW_OFFSCREEN_COORD,
        width: 1,
        height: 1,
      })
      .catch((err) => {
        console.warn('dsh set bounds failed', err);
      });
  }, []);

  const restoreDshWebView = useCallback(() => {
    updateBounds();
  }, [updateBounds]);

  // DOM overlay detection — delegated to OverlayManager singleton.
  // isVisible 参与 deps：容器挂载晚于首个 effect 时重建订阅，避免检测永久丢失。
  useEffect(() => {
    if (!isTauriShell()) {
      return;
    }
    const containerEl = containerRef.current;
    if (!containerEl) {
      return;
    }

    return getOverlayManager().subscribe(containerEl, (hasOverlap) => {
      if (hasOverlap === hideRequestedRef.current) {
        return;
      }

      hideRequestedRef.current = hasOverlap;
      if (!activeRef.current) {
        return;
      }

      if (hasOverlap) {
        hideDshWebView();
      } else if (!overlayActiveRef.current) {
        restoreDshWebView();
      }
    });
  }, [containerRef, hideDshWebView, restoreDshWebView, isVisible, hideRequestedRef]);

  // Overlay state-driven hide
  useEffect(() => {
    if (!isTauriShell() || !activeRef.current) {
      return;
    }
    if (overlayActive) {
      hideDshWebView();
    } else {
      // 与浏览器侧对称：state 切回非活跃时重置 DOM 守卫。MutationObserver
      // 可能尚未触发（如浮层元素仍在 DOM 但已不可见），否则
      // hideRequestedRef 卡在 true 会阻止后续 bounds 恢复。
      hideRequestedRef.current = false;
      restoreDshWebView();
    }
  }, [overlayActive, hideDshWebView, restoreDshWebView, hideRequestedRef]);

  // Visibility change
  useEffect(() => {
    if (!isTauriShell() || !activeRef.current) {
      return;
    }
    if (isVisible && !hideRequestedRef.current) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => restoreDshWebView());
      });
    } else if (!isVisible) {
      hideDshWebView();
    }
  }, [isVisible, hideDshWebView, restoreDshWebView, hideRequestedRef]);

  return { hideRequestedRef, activeRef };
}
