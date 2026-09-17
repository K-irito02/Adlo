/**
 * 搜索切片
 * 管理搜索查询和结果
 */
import type { WorkspaceSearchHit } from '@ai-digital-life/kernel';
import type { StoreState } from '../StoreState';

export interface SearchSlice {
  searchQuery: string;
  searchResults: WorkspaceSearchHit[];
  /** 是否正在检索中（防抖等待 + 后端请求期间为 true） */
  searching: boolean;

  setSearchQuery: (query: string) => void;
  setSearchResults: (results: WorkspaceSearchHit[]) => void;
  setSearching: (searching: boolean) => void;
  clearSearch: () => void;
}

export const createSearchSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): SearchSlice => ({
  searchQuery: '',
  searchResults: [],
  searching: false,

  setSearchQuery: (query) => set({ searchQuery: query }),
  setSearchResults: (results) => set({ searchResults: results }),
  setSearching: (searching) => set({ searching }),
  clearSearch: () => set({ searchQuery: '', searchResults: [], searching: false }),
});
