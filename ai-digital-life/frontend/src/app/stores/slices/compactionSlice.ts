import type { CompactionStatus } from '@shared/ipc';
import type { StoreState } from '../StoreState';

export interface CompactionSlice {
  compactionStatus: CompactionStatus | null;
  isCompacting: boolean;

  setCompactionStatus: (status: CompactionStatus | null) => void;
  setIsCompacting: (compacting: boolean) => void;
}

export const createCompactionSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState
): CompactionSlice => ({
  compactionStatus: null,
  isCompacting: false,

  setCompactionStatus: (status) => set({ compactionStatus: status }),
  setIsCompacting: (compacting) => set({ isCompacting: compacting }),
});
