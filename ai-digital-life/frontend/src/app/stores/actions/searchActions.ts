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
     * @writes searchSlice.searchQuery, searchSlice.searchResults
     * @see shared/ipc.ts → workspace.search
     * @see mock-bridge.ts → workspace.search
     * @see preview-bridge/index.ts → workspace.search
     */
    searchFiles: async (query: string) => {
      set({ searchQuery: query });
      if (!query.trim()) {
        set({ searchResults: [] });
        return;
      }
      debouncedSearch(query, async () => {
        if (get().searchQuery !== query) {
          return;
        }
        const result = await window.digitalLife.workspace.search(query);
        if (get().searchQuery !== query) {
          return;
        }
        if (!result.ok) {
          captureError(get, result.error, SCOPE);
          return;
        }
        set({ searchResults: result.data });
      });
    },
  };
}
