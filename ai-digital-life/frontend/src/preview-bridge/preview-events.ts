import type {
  WorkspaceFileChangedEvent,
  WorkspaceFilesChangedBatch,
} from '@ai-digital-life/kernel';
import { requestPreviewApi } from '../shared/ipc/preview-api';

export function createPreviewEventsBridge() {
  return {
    onFileChanged: (_listener: (event: WorkspaceFileChangedEvent) => void) => () => {},
    onFilesChanged: (listener: (batch: WorkspaceFilesChangedBatch) => void) => {
      let cursor = 0;
      let stopped = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const poll = async () => {
        if (stopped) {
          return;
        }
        try {
          const params = new URLSearchParams({ since: String(cursor) });
          const result = await requestPreviewApi<{
            cursor: number;
            changed: string[];
            removed: string[];
            overflow?: boolean;
          }>(`/workspace/files-changed?${params.toString()}`);
          if (result.ok && !stopped) {
            cursor = result.data.cursor;
            if (
              result.data.changed.length > 0 ||
              result.data.removed.length > 0 ||
              result.data.overflow
            ) {
              listener({
                changed: result.data.changed,
                removed: result.data.removed,
                overflow: result.data.overflow,
              });
            }
          }
        } catch (err) {
          console.warn('[preview-events] files-changed poll failed', err);
        }
        if (!stopped) {
          timer = setTimeout(poll, 2000);
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
