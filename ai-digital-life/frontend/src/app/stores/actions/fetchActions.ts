import type { StoreState } from '../StoreState';
import type { IndexingStatus } from '@ai-digital-life/kernel';
import type { StoreApi } from 'zustand';
import { captureError } from '../shared';
const SCOPE = 'fetch';

function startFetch(get: () => StoreState, key: string): boolean {
  if (get().isFetching[key]) {
    return false;
  }
  return true;
}

export function createFetchActions(set: StoreApi<StoreState>['setState'], get: () => StoreState) {
  return {
    /**
     * [fetchIndexStatus - 获取文件索引状态]
     * @writes diagnosticSlice.indexingStatus
     * @see shared/ipc.ts → retrieval.getStatus
     * @see mock-bridge.ts → retrieval.getStatus
     * @see preview-bridge/index.ts → retrieval.getStatus
     */
    fetchIndexStatus: async () => {
      const key = 'fetchIndexStatus';
      if (!startFetch(get, key)) {
        return;
      }
      set({ isFetching: { ...get().isFetching, [key]: true } });
      try {
        const result = await window.digitalLife.retrieval.getStatus();
        if (result.ok && result.data) {
          const snap = result.data;
          const stateMap: Record<string, IndexingStatus['state']> = {
            idle: 'idle',
            running: 'indexing',
            completed: 'indexed',
            failed: 'error',
          };
          const status: IndexingStatus = {
            state: stateMap[snap.status] ?? 'idle',
            scannedFiles: snap.scannedFiles,
            totalFiles: snap.scannedFiles,
            excludedFiles: snap.scannedFiles - snap.indexedTextFiles,
            lastIndexedAt: snap.completedAt,
            error: snap.lastError,
          };
          set({ indexingStatus: status });
        } else if (!result.ok) {
          captureError(get, result.error, SCOPE);
        }
      } finally {
        set({ isFetching: { ...get().isFetching, [key]: false } });
      }
    },

    /**
     * [fetchRepoMap - 获取代码仓库结构图]
     * @writes diagnosticSlice.repoMap
     * @see shared/ipc.ts → retrieval.getRepoMap
     * @see mock-bridge.ts → retrieval.getRepoMap
     * @see preview-bridge/index.ts → retrieval.getRepoMap
     */
    fetchRepoMap: async () => {
      const key = 'fetchRepoMap';
      if (!startFetch(get, key)) {
        return;
      }
      set({ isFetching: { ...get().isFetching, [key]: true } });
      try {
        const result = await window.digitalLife.retrieval.getRepoMap();
        if (result.ok) {
          set({ repoMap: result.data });
        } else {
          captureError(get, result.error, SCOPE);
        }
      } finally {
        set({ isFetching: { ...get().isFetching, [key]: false } });
      }
    },
  };
}
