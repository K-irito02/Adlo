import type { StoreState } from "../StoreState";
import { createDebouncedSearch } from "../shared";
import type { StoreApi } from "zustand";

const debouncedSearch = createDebouncedSearch(300);

export function createSearchActions(set: StoreApi<StoreState>["setState"], get: () => StoreState) {
  return {
    searchFiles: async (query: string) => {
      set({ searchQuery: query });
      if (!query.trim()) {
        set({ searchResults: [] });
        return;
      }
      debouncedSearch(query, async () => {
        if (get().searchQuery !== query) return;
        const result = await window.digitalLife.workspace.search(query);
        if (get().searchQuery !== query) return;
        if (!result.ok) {
          set({ error: result.error.message });
          return;
        }
        set({ searchResults: result.data });
      });
    },
  };
}
