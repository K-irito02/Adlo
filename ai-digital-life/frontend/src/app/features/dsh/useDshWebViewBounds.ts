import { useCallback, useEffect, useRef } from 'react';
import { isTauriShell } from '@shared/env';

/**
 * DSH WebView 边界同步 Hook：监听 DSH host 容器尺寸变化，将精确 bounds
 * 同步到后端原生 WebView2 子窗口。
 *
 * 解决两个问题：
 * 1. 旧 `dsh_central_bounds` 使用近似百分比定位，y=0 侵占 TitleBar 区域
 * 2. bounds 仅在创建时计算一次，窗口/侧栏缩放后不跟随变化
 *
 * 原理与 `useWebViewBounds` 一致：ResizeObserver 监听容器 → getBoundingClientRect
 * 读取精确坐标 → 调用 `browser_set_dsh_bounds` IPC 更新原生 WebView 位置。
 */
export function useDshWebViewBounds() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const updateBounds = useCallback(() => {
    if (!containerRef.current || !isTauriShell()) {
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }
    const bounds = {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
    window.digitalLife?.browser?.setDshBounds(bounds).catch((err) => {
      console.warn('dsh set bounds failed', err);
    });
  }, []);

  const updateBoundsRef = useRef(updateBounds);
  useEffect(() => {
    updateBoundsRef.current = updateBounds;
  }, [updateBounds]);

  useEffect(() => {
    if (!isTauriShell() || !containerRef.current) {
      return;
    }
    const observer = new ResizeObserver(() => {
      updateBoundsRef.current();
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  return { containerRef, updateBounds };
}
