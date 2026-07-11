import type { StoreState } from '../StoreState';
import type { StoreApi } from 'zustand';
import type { ReferenceConfig } from '@shared/ipc';
import { clearError, captureTypedError } from '../shared';

export function createReferenceActions(
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState
) {
  return {
    fetchReferences: async (dataDir: string) => {
      set({ isFetchingReferences: true });
      clearError(get);
      const bridge = window.digitalLife;
      const result = await bridge.reference.listReferences(dataDir);
      if (!result.ok) {
        captureTypedError(get, result.error);
        set({ isFetchingReferences: false });
        return;
      }
      set({ references: result.data, isFetchingReferences: false });
    },

    addReference: async (dataDir: string, reference: ReferenceConfig) => {
      clearError(get);
      const bridge = window.digitalLife;
      const result = await bridge.reference.addReference(dataDir, reference);
      if (!result.ok) {
        captureTypedError(get, result.error);
        return;
      }
      set({ references: result.data });
    },

    removeReference: async (dataDir: string, name: string) => {
      clearError(get);
      const bridge = window.digitalLife;
      const result = await bridge.reference.removeReference(dataDir, name);
      if (!result.ok) {
        captureTypedError(get, result.error);
        return;
      }
      set({ references: result.data });
    },
  };
}
