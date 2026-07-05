import type { WebFetchResult, WebSearchResult } from '@shared/ipc';
import type { StoreState } from '../StoreState';

export interface WebToolsSlice {
  webFetchResult: WebFetchResult | null;
  webSearchResults: WebSearchResult | null;
  isWebFetching: boolean;

  setWebFetchResult: (result: WebFetchResult | null) => void;
  setWebSearchResults: (results: WebSearchResult | null) => void;
  setIsWebFetching: (fetching: boolean) => void;
}

export const createWebToolsSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState
): WebToolsSlice => ({
  webFetchResult: null,
  webSearchResults: null,
  isWebFetching: false,

  setWebFetchResult: (result) => set({ webFetchResult: result }),
  setWebSearchResults: (results) => set({ webSearchResults: results }),
  setIsWebFetching: (fetching) => set({ isWebFetching: fetching }),
});
