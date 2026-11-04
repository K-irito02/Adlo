import { useEffect } from 'react';
import { useAppStore } from '@stores/slicedStore';

/** 滚动跟随重试上限（rAF 逐帧重试，等虚拟化行挂载后再定位）。 */
const MAX_ATTEMPTS = 30;

function findRowElement(workspaceId: string, relPath: string): HTMLElement | null {
  const scope = document.querySelector(`[data-workspace-id="${CSS.escape(workspaceId)}"]`);
  if (!scope) {
    return null;
  }
  // 文件树匹配段不区分大小写（与 revealWorkspaceDirectory 同口径），滚动查找同理。
  const want = relPath.replace(/\\/g, '/').toLowerCase();
  const rows = scope.querySelectorAll<HTMLElement>('[data-path]');
  for (const row of rows) {
    const actual = row.getAttribute('data-path');
    if (actual && actual.replace(/\\/g, '/').toLowerCase() === want) {
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
  const consume = useAppStore((s) => s.consumeFileTreeReveal);

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
        // 消费成功后清掉一次性请求：后续 remount 不再重放，避免无端滚动。
        consume();
        return;
      }
      attempts += 1;
      if (attempts < MAX_ATTEMPTS) {
        raf = requestAnimationFrame(tick);
      } else {
        // 行始终未出现（文件已删/树被过滤）：同样消费掉，避免以后 remount
        // 时用过期请求误滚（事项 6 复审 N4）。
        consume();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [request, consume]);
}
