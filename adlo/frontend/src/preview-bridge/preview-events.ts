import type { WorkspaceFileChangedEvent, WorkspaceFilesChangedBatch } from '@adlo/kernel';
import { requestPreviewApi } from '../shared/ipc/preview-api';
import { workspacePathKey } from '../shared/workspacePathMatch';

interface FilesChangedResponse {
  cursor: number;
  changed: unknown;
  removed: unknown;
  overflow?: boolean;
}

/**
 * 订阅者显式声明的监听根（`workspace.setFilesChangedRoots`）。
 * 预览模式在「可达 adl-server」时工作区操作走 HTTP，共享 ctx 不会被 preview
 * `open` 更新；因此根集合由应用层（侧栏 state）显式驱动。
 */
let declaredRoots: string[] = [];

/** 供 preview bridge 的 `setFilesChangedRoots` 调用（模块级，跨订阅者共享）。 */
export function setPreviewWatchRoots(roots: string[]): void {
  const seen = new Set<string>();
  declaredRoots = roots.filter((root) => {
    const key = workspacePathKey(root);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/** 当前需要轮询的工作区根（去重后）。 */
export function collectPreviewWatchRoots(): string[] {
  return declaredRoots;
}

function toStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export function createPreviewEventsBridge() {
  return {
    onFileChanged: (_listener: (event: WorkspaceFileChangedEvent) => void) => () => {},
    setFilesChangedRoots: (roots: string[]) => {
      setPreviewWatchRoots(roots);
    },
    onFilesChanged: (listener: (batch: WorkspaceFilesChangedBatch) => void) => {
      // 前置条件：App 级单订阅者（useAppStartup 常驻订阅）。多订阅者将各自独立
      // 轮询（N×2s 链）；若未来出现第二订阅者，须收敛为模块级共享 poller。
      // 每根独立游标：新增工作区从 0 开始（首轮全量语义），移除后游标随之丢弃。
      const cursors = new Map<string, number>();
      let stopped = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const pollRoot = async (rootPath: string) => {
        const key = workspacePathKey(rootPath);
        const since = cursors.get(key) ?? 0;
        const params = new URLSearchParams({ rootPath, since: String(since) });
        const result = await requestPreviewApi<FilesChangedResponse>(
          `/workspace/files-changed?${params.toString()}`,
        );
        if (stopped) {
          return;
        }
        if (!result.ok) {
          return;
        }
        cursors.set(key, result.data.cursor);
        const changed = toStringList(result.data.changed);
        const removed = toStringList(result.data.removed);
        const overflow = result.data.overflow === true;
        if (changed.length > 0 || removed.length > 0 || overflow) {
          listener({ rootPath, changed, removed, overflow });
        }
      };

      const poll = async () => {
        if (stopped) {
          return;
        }
        try {
          const roots = collectPreviewWatchRoots();
          // 侧栏移除/隐藏的工作区不再轮询，游标一并丢弃（不泄漏）。
          const liveKeys = new Set(roots.map((root) => workspacePathKey(root)));
          for (const key of [...cursors.keys()]) {
            if (!liveKeys.has(key)) {
              cursors.delete(key);
            }
          }
          await Promise.allSettled(roots.map((root) => pollRoot(root)));
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
