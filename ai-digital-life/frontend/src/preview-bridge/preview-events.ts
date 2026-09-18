import type {
  WorkspaceFileChangedEvent,
  WorkspaceFilesChangedBatch,
  WorkspaceMeta,
} from '@ai-digital-life/kernel';
import { requestPreviewApi } from '../shared/ipc/preview-api';

/** Preview bridge shared mutable context (same shape as `preview-search.ts`). */
export interface PreviewEventsContext {
  currentWorkspace: WorkspaceMeta | undefined;
}

export function createPreviewEventsBridge(ctx: PreviewEventsContext) {
  return {
    onFileChanged: (_listener: (event: WorkspaceFileChangedEvent) => void) => () => {},
    onFilesChanged: (listener: (batch: WorkspaceFilesChangedBatch) => void) => {
      // 前置条件：App 级单订阅者（useAppStartup 常驻订阅）。多订阅者将各自独立
      // 轮询（N×2s 链）；若未来出现第二订阅者，须收敛为模块级共享 poller。
      let cursor = 0;
      let lastRootPath: string | undefined;
      let stopped = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const poll = async () => {
        if (stopped) {
          return;
        }
        try {
          // 与 `preview-search.ts` 相同：从共享 ctx 读取当前工作区；未打开工作区时跳过本轮。
          const rootPath = ctx.currentWorkspace?.rootPath;
          if (!rootPath) {
            return;
          }
          if (lastRootPath !== rootPath) {
            // 工作区切换：旧游标对新根无意义，重置后自愈（首轮即全量语义）。
            lastRootPath = rootPath;
            cursor = 0;
          }
          const params = new URLSearchParams({ rootPath, since: String(cursor) });
          const result = await requestPreviewApi<{
            cursor: number;
            changed: unknown;
            removed: unknown;
            overflow?: boolean;
          }>(`/workspace/files-changed?${params.toString()}`);
          if (result.ok && !stopped) {
            cursor = result.data.cursor;
            const changed = Array.isArray(result.data.changed)
              ? result.data.changed.filter((p): p is string => typeof p === 'string')
              : [];
            const removed = Array.isArray(result.data.removed)
              ? result.data.removed.filter((p): p is string => typeof p === 'string')
              : [];
            if (changed.length > 0 || removed.length > 0 || result.data.overflow) {
              listener({
                changed,
                removed,
                overflow: result.data.overflow,
              });
            }
          }
        } catch (err) {
          console.warn('[preview-events] files-changed poll failed', err);
        } finally {
          if (!stopped) {
            timer = setTimeout(poll, 2000);
          }
        }
      };
      timer = setTimeout(poll, 2000);
      return () => {
        stopped = true;
        if (timer !== undefined) {
          clearTimeout(timer);
        }
      };
    },
  };
}
