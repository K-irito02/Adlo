import { useCallback } from 'react';

/** 缩放步长（菜单点击与快捷键共用，改一处即同步）。 */
export const ZOOM_STEP = 0.1;

export function useAppZoom(): {
  zoomBy: (delta: number) => void;
  resetZoom: () => void;
} {
  const zoomBy = useCallback((delta: number) => {
    const current = parseFloat(getComputedStyle(document.documentElement).zoom || '1');
    // 取整到 0.1，避免多次累加的浮点串（如 1.0000000000000002）进 style。
    const next =
      Math.round(
        Math.max(0.5, Math.min(2, (Number.isFinite(current) ? current : 1) + delta)) * 10,
      ) / 10;
    document.documentElement.style.zoom = String(next);
  }, []);
  const resetZoom = useCallback(() => {
    document.documentElement.style.zoom = '1';
  }, []);
  return { zoomBy, resetZoom };
}
