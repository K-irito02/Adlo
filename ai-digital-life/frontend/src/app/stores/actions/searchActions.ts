import type { StoreState } from '../StoreState';
import { createDebouncedSearch } from '../shared';
import { captureError } from '../cacheHelpers';
import type { StoreApi } from 'zustand';
const SCOPE = 'search';

const debouncedSearch = createDebouncedSearch(300);

export function createSearchActions(set: StoreApi<StoreState>['setState'], get: () => StoreState) {
  return {
    /**
     * [searchFiles - 在工作区搜索文件/内容]
     * @writes searchSlice.searchQuery, searchSlice.searchResults, searchSlice.searching
     * @see shared/ipc.ts → workspace.search
     * @see mock-bridge.ts → workspace.search
     * @see preview-bridge/index.ts → workspace.search
     */
    searchFiles: async (query: string) => {
      set({ searchQuery: query });
      if (!query.trim()) {
        set({ searchResults: [], searching: false });
        return;
      }
      if (get().filesSearchScope === 'file') {
        // 文件范围为纯前端过滤：仅提交检索词，不发后端内容请求、不置加载态
        set({ searching: false });
        return;
      }
      // 新检索发起即清空旧结果并进入加载态，避免旧结果常驻到新结果返回
      set({ searchResults: [], searching: true });
      debouncedSearch(query, async () => {
        if (get().searchQuery !== query) {
          return;
        }
        try {
          const result = await window.digitalLife.workspace.search(query);
          if (get().searchQuery !== query) {
            return;
          }
          if (!result.ok) {
            captureError(get, result.error, SCOPE);
            return;
          }
          set({ searchResults: result.data });
        } finally {
          if (get().searchQuery === query) {
            set({ searching: false });
          }
        }
      });
    },
  };
}
