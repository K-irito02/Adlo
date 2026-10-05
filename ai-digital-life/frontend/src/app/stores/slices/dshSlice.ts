import type { DshVersionStatus, DshSourceStatus } from '../../../shared/ipc/dsh';
import type { StoreState } from '../StoreState';

export interface DshSlice {
  /** dsh 版本目录状态（当前选中/已装/最新/是否有更新） */
  versionStatus: DshVersionStatus | null;
  /** dsh 下载源状态（bundled / system / running / config） */
  sourceStatus: DshSourceStatus | null;

  setDshVersionStatus: (status: DshVersionStatus | null) => void;
  setDshSourceStatus: (status: DshSourceStatus | null) => void;
}

export const createDshSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): DshSlice => ({
  versionStatus: null,
  sourceStatus: null,

  setDshVersionStatus: (status) => set({ versionStatus: status }),
  setDshSourceStatus: (status) => set({ sourceStatus: status }),
});
