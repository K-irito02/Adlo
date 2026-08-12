import type { StoreState } from '../StoreState';
import type { StoreApi } from 'zustand';
import type { CompactSessionInput } from '@shared/ipc';
import { clearError, captureError } from '../shared';
const SCOPE = 'compaction';

export function createCompactionActions(
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState,
) {
  return {
    compactSession: async (input: CompactSessionInput) => {
      set({ isCompacting: true });
      clearError(get, SCOPE);
      const result = await window.digitalLife.compaction.compactSession(input);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        set({ isCompacting: false });
        return null;
      }
      set({ isCompacting: false });
      set({
        compactionStatus: {
          active: false,
          pruned_count: result.data.prunedCount,
          last_compacted_at: Date.now(),
        },
      });
      return result.data;
    },
  };
}
