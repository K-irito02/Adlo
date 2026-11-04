import type {
  WorkspaceSearchFilter,
  WorkspaceSearchPage,
  WorkspaceSearchWindow,
  FileOutlineItem,
  WorkspaceMeta,
} from '@adlo/kernel';
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

/** 检索过滤器转查询串（GET 检索用；POST 检索直接进 body）。
 *
 * 取舍（事项 M6）：GET 查询串有 URL 长度上限，数百条名单可能触顶（414）；
 * 当前名单来自用户手动勾选（通常几十条内），暂走 GET；若未来支持大名单，
 * `search` 需改走 POST body（dev 服务加 POST `/workspace/search` 路由）。
 */
function filterParams(filter?: WorkspaceSearchFilter): Record<string, string> {
  if (!filter) {
    return {};
  }
  const params: Record<string, string> = {};
  if (filter.excludedPaths !== undefined) {
    params.excludedPaths = JSON.stringify(filter.excludedPaths);
  }
  if (filter.useGitignore !== undefined) {
    params.useGitignore = filter.useGitignore ? '1' : '0';
  }
  return params;
}

export function createPreviewSearchBridge(ctx: PreviewSearchContext) {
  return {
    search: async (
      query: string,
      window?: WorkspaceSearchWindow,
      filter?: WorkspaceSearchFilter,
      workspacePath?: string,
    ) => {
      const root = workspacePath ?? ctx.currentWorkspace?.rootPath;
      if (!root) {
        return { ok: true as const, data: emptyPage() };
      }
      const params = new URLSearchParams({
        rootPath: root,
        query,
        ...windowParams(window),
        ...filterParams(filter),
      });
      return requestPreviewApi<WorkspaceSearchPage>(`/workspace/search?${params.toString()}`);
    },
    searchInFiles: async (
      paths: string[],
      query: string,
      window?: WorkspaceSearchWindow,
      filter?: WorkspaceSearchFilter,
      workspacePath?: string,
    ) => {
      const root = workspacePath ?? ctx.currentWorkspace?.rootPath;
      if (!root) {
        return { ok: true as const, data: emptyPage() };
      }
      const params = new URLSearchParams({ rootPath: root });
      // 与 `search` 对称：窗口先规范化再进 body（NaN/负数/超大不直接上路）。
      const normalized = normalizeSearchWindow(window);
      return requestPreviewApi<WorkspaceSearchPage>(
        `/workspace/search-in-files?${params.toString()}`,
        {
          method: 'POST',
          body: JSON.stringify({
            paths,
            query,
            offset: normalized.offset,
            limit: normalized.limit,
            ...(filter?.excludedPaths !== undefined ? { excludedPaths: filter.excludedPaths } : {}),
            ...(filter?.useGitignore !== undefined ? { useGitignore: filter.useGitignore } : {}),
          }),
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
