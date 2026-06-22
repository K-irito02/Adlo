import type { WorkspaceSearchHit, FileOutlineItem } from '@ai-digital-life/kernel';
import { requestPreviewApi } from './api';
import type { PreviewContext } from './preview-context';

export function createPreviewSearchBridge(ctx: PreviewContext) {
  return {
    search: async (query: string) => {
      if (!ctx.currentWorkspace) {
        return { ok: true as const, data: [] as WorkspaceSearchHit[] };
      }
      const params = new URLSearchParams({ rootPath: ctx.currentWorkspace.rootPath, query });
      return requestPreviewApi<WorkspaceSearchHit[]>(`/workspace/search?${params.toString()}`);
    },
    outline: async (relativePath: string) => {
      if (!ctx.currentWorkspace) {
        return { ok: true as const, data: [] as FileOutlineItem[] };
      }
      const params = new URLSearchParams({
        rootPath: ctx.currentWorkspace.rootPath,
        relativePath,
      });
      return requestPreviewApi<FileOutlineItem[]>(`/workspace/outline?${params.toString()}`);
    },
  };
}
