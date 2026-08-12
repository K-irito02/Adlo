import type { StoreState } from '../StoreState';
import type { StoreApi } from 'zustand';
import type { ReferenceConfig } from '@shared/ipc/reference';
import { clearError, captureError } from '../shared';
const SCOPE = 'reference';

export function createReferenceActions(
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState,
) {
  return {
    fetchReferences: async (dataDir: string) => {
      set({ isFetchingReferences: true });
      clearError(get, SCOPE);
      const bridge = window.digitalLife;
      const result = await bridge.reference.listReferences(dataDir);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        set({ isFetchingReferences: false });
        return;
      }
      set({ references: result.data, isFetchingReferences: false });
    },

    addReference: async (dataDir: string, reference: ReferenceConfig) => {
      clearError(get, SCOPE);
      const bridge = window.digitalLife;
      const result = await bridge.reference.addReference(dataDir, reference);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return;
      }
      set({ references: result.data });
    },

    removeReference: async (dataDir: string, name: string) => {
      clearError(get, SCOPE);
      const bridge = window.digitalLife;
      const result = await bridge.reference.removeReference(dataDir, name);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return;
      }
      set({ references: result.data });
    },
  };
}
