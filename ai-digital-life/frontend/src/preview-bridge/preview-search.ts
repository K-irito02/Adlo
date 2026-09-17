import type {
  WorkspaceSearchHit,
  FileOutlineItem,
  RecentWorkspaceEntry,
  RetrievalSnapshot,
  WorkspaceMeta,
} from '@ai-digital-life/kernel';
import { requestPreviewApi } from '../shared/ipc/preview-api';

/** Preview bridge shared mutable context (subset previously exported by preview-context). */
export interface PreviewSearchContext {
  recentWorkspaces: RecentWorkspaceEntry[];
  currentWorkspace: WorkspaceMeta | undefined;
  retrievalStatus: RetrievalSnapshot | undefined;
}

export function createPreviewSearchBridge(ctx: PreviewSearchContext) {
  return {
    search: async (query: string) => {
      if (!ctx.currentWorkspace) {
        return { ok: true as const, data: [] as WorkspaceSearchHit[] };
      }
      const params = new URLSearchParams({ rootPath: ctx.currentWorkspace.rootPath, query });
      return requestPreviewApi<WorkspaceSearchHit[]>(`/workspace/search?${params.toString()}`);
    },
    searchInFiles: async (paths: string[], query: string) => {
      if (!ctx.currentWorkspace) {
        return { ok: true as const, data: [] as WorkspaceSearchHit[] };
      }
      const params = new URLSearchParams({ rootPath: ctx.currentWorkspace.rootPath });
      return requestPreviewApi<WorkspaceSearchHit[]>(
        `/workspace/search-in-files?${params.toString()}`,
        {
          method: 'POST',
          body: JSON.stringify({ paths, query }),
        },
      );
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
