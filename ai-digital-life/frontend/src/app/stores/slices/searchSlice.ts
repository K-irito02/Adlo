/**
 * 搜索切片
 * 管理搜索查询和结果
 */
import type { WorkspaceSearchHit } from "@ai-digital-life/kernel";

export interface SearchSlice {
  searchQuery: string;
  searchResults: WorkspaceSearchHit[];

  setSearchQuery: (query: string) => void;
  setSearchResults: (results: WorkspaceSearchHit[]) => void;
  clearSearch: () => void;
}

export const createSearchSlice = (
  set: (partial: Partial<SearchSlice> | ((state: SearchSlice) => Partial<SearchSlice>)) => void,
  get: () => SearchSlice
): SearchSlice => ({
  searchQuery: "",
  searchResults: [],

  setSearchQuery: (query) => set({ searchQuery: query }),
  setSearchResults: (results) => set({ searchResults: results }),
  clearSearch: () => set({ searchQuery: "", searchResults: [] })
});
