import { useEffect } from 'react';
import { useAppStore } from '@stores/slicedStore';

/** 滚动跟随重试上限（rAF 逐帧重试，等虚拟化行挂载后再定位）。 */
const MAX_ATTEMPTS = 30;

function findRowElement(workspaceId: string, relPath: string): HTMLElement | null {
  const scope = document.querySelector(`[data-workspace-id="${CSS.escape(workspaceId)}"]`);
  if (!scope) {
    return null;
  }
  const want = relPath.replace(/\\/g, '/');
  const rows = scope.querySelectorAll<HTMLElement>('[data-path]');
  for (const row of rows) {
    const actual = row.getAttribute('data-path');
    if (actual && actual.replace(/\\/g, '/') === want) {
      return row;
    }
  }
  return null;
}

/**
 * 消费一次性的文件树定位滚动请求：找到对应行后将其滚动到可视区。
 * 仅文件面板挂载此 hook（变更面板不跟随滚动，避免跨面板抢夺视图）。
 */
export function useFileTreeRevealOnRequest(): void {
  const request = useAppStore((s) => s.fileTreeRevealRequest);

  useEffect(() => {
    if (!request) {
      return undefined;
    }
    const { workspaceId, path } = request;
    let attempts = 0;
    let raf = 0;
    const tick = () => {
      const el = findRowElement(workspaceId, path);
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'nearest' });
        return;
      }
      attempts += 1;
      if (attempts < MAX_ATTEMPTS) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [request]);
}
