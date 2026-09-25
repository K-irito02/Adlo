import { useCallback } from 'react';

export function useAppZoom(): {
  zoomBy: (delta: number) => void;
  resetZoom: () => void;
} {
  const zoomBy = useCallback((delta: number) => {
    const current = parseFloat(getComputedStyle(document.documentElement).zoom || '1');
    const next = Math.max(0.5, Math.min(2, (Number.isFinite(current) ? current : 1) + delta));
    document.documentElement.style.zoom = String(next);
  }, []);
  const resetZoom = useCallback(() => {
    document.documentElement.style.zoom = '1';
  }, []);
  return { zoomBy, resetZoom };
}
