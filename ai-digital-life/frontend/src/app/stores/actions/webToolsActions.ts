import type { StoreState } from '../StoreState';
import type { StoreApi } from 'zustand';
import { clearError, captureError } from '../shared';

export function createWebToolsActions(
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState,
) {
  return {
    webFetch: async (url: string) => {
      set({ isWebFetching: true });
      clearError(get);
      const result = await window.digitalLife.webTools.webFetch(url);
      if (!result.ok) {
        captureError(get, result.error);
        set({ isWebFetching: false });
        return;
      }
      set({ webFetchResult: result.data, isWebFetching: false });
    },

    webSearch: async (query: string) => {
      set({ isWebFetching: true });
      clearError(get);
      const result = await window.digitalLife.webTools.webSearch(query);
      if (!result.ok) {
        captureError(get, result.error);
        set({ isWebFetching: false });
        return;
      }
      set({ webSearchResults: result.data, isWebFetching: false });
    },

    clearWebResults: () => {
      set({ webFetchResult: null, webSearchResults: null });
    },
  };
}
