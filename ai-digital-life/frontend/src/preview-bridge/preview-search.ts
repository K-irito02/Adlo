import type {
  WorkspaceSearchPage,
  WorkspaceSearchWindow,
  FileOutlineItem,
  WorkspaceMeta,
} from '@ai-digital-life/kernel';
import { requestPreviewApi } from '../shared/ipc/preview-api';
import { normalizeSearchWindow } from '../shared/ipc/searchWindow';

/** Preview bridge shared mutable context（仅消费 currentWorkspace，其余字段已裁剪）。 */
export interface PreviewSearchContext {
  currentWorkspace: WorkspaceMeta | undefined;
}

function emptyPage(): WorkspaceSearchPage {
  return { hits: [], hasMore: false };
}

/** 预览服务的检索为 GET，窗口需落到查询串上（用规范化后的值，与后端语义一致）。 */
function windowParams(window?: WorkspaceSearchWindow): Record<string, string> {
  const { offset, limit } = normalizeSearchWindow(window);
  return { offset: String(offset), limit: String(limit) };
}

export function createPreviewSearchBridge(ctx: PreviewSearchContext) {
  return {
    search: async (query: string, window?: WorkspaceSearchWindow) => {
      if (!ctx.currentWorkspace) {
        return { ok: true as const, data: emptyPage() };
      }
      const params = new URLSearchParams({
        rootPath: ctx.currentWorkspace.rootPath,
        query,
        ...windowParams(window),
      });
      return requestPreviewApi<WorkspaceSearchPage>(`/workspace/search?${params.toString()}`);
    },
    searchInFiles: async (paths: string[], query: string, window?: WorkspaceSearchWindow) => {
      if (!ctx.currentWorkspace) {
        return { ok: true as const, data: emptyPage() };
      }
      const params = new URLSearchParams({ rootPath: ctx.currentWorkspace.rootPath });
      return requestPreviewApi<WorkspaceSearchPage>(
        `/workspace/search-in-files?${params.toString()}`,
        {
          method: 'POST',
          body: JSON.stringify({ paths, query, ...window }),
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
