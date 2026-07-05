import type { ReferenceConfig } from '@shared/ipc';
import type { StoreState } from '../StoreState';

export interface ReferenceSlice {
  references: ReferenceConfig[];
  isFetchingReferences: boolean;
  setReferences: (references: ReferenceConfig[]) => void;
  setFetchingReferences: (fetching: boolean) => void;
}

export const createReferenceSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState
): ReferenceSlice => ({
  references: [],
  isFetchingReferences: false,

  setReferences: (references) => set({ references }),
  setFetchingReferences: (fetching) => set({ isFetchingReferences: fetching }),
});
