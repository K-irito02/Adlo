import type { StoreState } from '../StoreState';
import type { StoreApi } from 'zustand';
import { clearError, captureError } from '../shared';

export function createCompactionActions(
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState
) {
  return {
    compactSession: async (messagesJson: string, provider: string) => {
      set({ isCompacting: true });
      clearError(get);
      const result = await window.digitalLife.compaction.compactSession(messagesJson, provider);
      if (!result.ok) {
        captureError(get, result.error);
        set({ isCompacting: false });
        return null;
      }
      set({ isCompacting: false });
      set({
        compactionStatus: {
          active: false,
          pruned_count: result.data.pruned_count,
          last_compacted_at: Date.now(),
        },
      });
      return result.data;
    },
  };
}
