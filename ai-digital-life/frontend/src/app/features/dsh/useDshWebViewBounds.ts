import { useCallback, useEffect, useRef } from 'react';
import { isTauriShell } from '@shared/env';

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
 *
 * 解决两个问题：
 * 1. 旧 `dsh_central_bounds` 使用近似百分比定位，y=0 侵占 TitleBar 区域
 * 2. bounds 仅在创建时计算一次，窗口/侧栏缩放后不跟随变化
 *
 * 原理与 `useWebViewBounds` 一致：ResizeObserver 监听容器 → getBoundingClientRect
 * 读取精确坐标 → 调用 `browser_set_dsh_bounds` IPC 更新原生 WebView 位置。
 */
export function useDshWebViewBounds(options: {
  webViewDisabled?: boolean;
  /** 与 visibility 侧共享的 DOM 浮层隐藏守卫（必填：缺失时 resize 会把已隐藏的 WebView 拉回）。
   * 调用方必须传入与 `useDshWebViewVisibility` 的 `hideRequestedRef` 参数同一个 ref 对象
   *（见 DshHostRegion），否则两侧脱钩、守卫静默失效。 */
  hideRequestedRef: React.RefObject<boolean>;
  /**
   * 容器挂载就绪信号（调用方传入 `isTauri && !!url`）。
   * url 由空变有时容器才首次挂载，observer effect 靠它重跑完成挂载；
   * 缺省 true 保持旧行为。
   */
  containerReady?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const webViewDisabledRef = useRef(options.webViewDisabled ?? false);

  // Sync webViewDisabledRef with options.webViewDisabled
  useEffect(() => {
    webViewDisabledRef.current = options.webViewDisabled ?? false;
  }, [options.webViewDisabled]);
  const hideRequestedRef = options.hideRequestedRef;
  const containerReady = options.containerReady ?? true;

  const updateBounds = useCallback(() => {
    if (!containerRef.current || !isTauriShell()) {
      return;
    }
    // 与 observer 回调对称：禁用期间（中间区被遮挡）直接调用也不恢复位置，
    // 不只依赖调用点守卫，避免后续新增调用点遗漏。
    if (webViewDisabledRef.current) {
      return;
    }
    // DOM 浮层隐藏期间不恢复位置，避免 ResizeObserver 把已移出画面的 WebView 拉回盖住浮层
    if (hideRequestedRef.current) {
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
  }, [hideRequestedRef]);

  const updateBoundsRef = useRef(updateBounds);
  useEffect(() => {
    updateBoundsRef.current = updateBounds;
  }, [updateBounds]);

  useEffect(() => {
    if (!isTauriShell() || !containerRef.current) {
      return;
    }
    const observer = new ResizeObserver(() => {
      if (webViewDisabledRef.current) {
        return;
      }
      if (hideRequestedRef.current) {
        return;
      }
      updateBoundsRef.current();
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
    // containerReady：url 由空变有时容器才首次挂载，靠它重跑完成挂载；
    // hideRequestedRef 为稳定 ref 对象，列入 deps 仅恢复 lint 保护，不引起重跑。
  }, [containerReady, hideRequestedRef]);

  return { containerRef, updateBounds };
}
