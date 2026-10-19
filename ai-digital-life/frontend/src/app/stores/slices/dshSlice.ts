import type { DshVersionCatalog, DshVersionStatus, DshSourceStatus } from '../../../shared/ipc/dsh';
import type { StoreState } from '../StoreState';

export interface DshSlice {
  /** dsh 版本目录状态（当前选中/已装/最新/是否有更新，含预发布通道） */
  versionStatus: DshVersionStatus | null;
  /** dsh 官方版本目录（正式版/预发布分桶；设置页版本块按需拉取） */
  versionCatalog: DshVersionCatalog | null;
  /** dsh 下载源状态（bundled / system / running / config） */
  sourceStatus: DshSourceStatus | null;

  setDshVersionStatus: (status: DshVersionStatus | null) => void;
  setDshVersionCatalog: (catalog: DshVersionCatalog | null) => void;
  setDshSourceStatus: (status: DshSourceStatus | null) => void;
}

export const createDshSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): DshSlice => ({
  versionStatus: null,
  versionCatalog: null,
  sourceStatus: null,

  setDshVersionStatus: (status) => set({ versionStatus: status }),
  setDshVersionCatalog: (catalog) => set({ versionCatalog: catalog }),
  setDshSourceStatus: (status) => set({ sourceStatus: status }),
});
