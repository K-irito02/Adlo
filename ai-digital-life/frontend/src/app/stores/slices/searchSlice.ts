/**
 * 搜索切片
 * 管理搜索查询和结果
 */
import type { WorkspaceSearchHit } from '@ai-digital-life/kernel';
import type { StoreState } from '../StoreState';

export interface SearchSlice {
  searchQuery: string;
  searchResults: WorkspaceSearchHit[];

  setSearchQuery: (query: string) => void;
  setSearchResults: (results: WorkspaceSearchHit[]) => void;
  clearSearch: () => void;
}

export const createSearchSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): SearchSlice => ({
  searchQuery: '',
  searchResults: [],

  setSearchQuery: (query) => set({ searchQuery: query }),
  setSearchResults: (results) => set({ searchResults: results }),
  clearSearch: () => set({ searchQuery: '', searchResults: [] }),
});
