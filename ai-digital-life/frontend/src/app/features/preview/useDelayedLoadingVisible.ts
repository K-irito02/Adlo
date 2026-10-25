import { useEffect, useRef, useState } from 'react';

export interface LoadingVisibilityOptions {
  /** 加载持续多久才显示占位：过滤“刚出现就消失”的闪烁（默认 150ms）。 */
  delayMs?: number;
  /** 一旦显示至少停留多久，避免一帧闪灭（默认 300ms）。 */
  minVisibleMs?: number;
}

/**
 * 延迟显现 + 最短展示时长。
 * 用户反馈：文件打开太快时扫光“刚亮就灭”，观感差；变更面板只在真正等待时出现。
 * 因此加载开始后先等 `delayMs`，仍未完成才显示；显示后至少保持 `minVisibleMs`。
 * 计时以“加载状态变 true”为起点，与组件挂载解耦（StrictMode 重复挂载不误判）。
 */
export function useDelayedLoadingVisible(
  active: boolean,
  { delayMs = 150, minVisibleMs = 300 }: LoadingVisibilityOptions = {},
): boolean {
  const [visible, setVisible] = useState(false);
  const shownAtRef = useRef(0);

  useEffect(() => {
    if (active) {
      if (visible) {
        // 新的加载周期从此刻重新计最短展示时长（否则会沿用上一轮的起点）。
        shownAtRef.current = Date.now();
        return undefined;
      }
      const timer = window.setTimeout(() => {
        shownAtRef.current = Date.now();
        setVisible(true);
      }, delayMs);
      return () => window.clearTimeout(timer);
    }

    if (!visible) {
      return undefined;
    }
    const elapsed = Date.now() - shownAtRef.current;
    const remaining = Math.max(0, minVisibleMs - elapsed);
    const timer = window.setTimeout(() => setVisible(false), remaining);
    return () => window.clearTimeout(timer);
  }, [active, visible, delayMs, minVisibleMs]);

  return visible;
}
