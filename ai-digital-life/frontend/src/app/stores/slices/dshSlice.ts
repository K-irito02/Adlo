import type {
  DshVersionCatalog,
  DshVersionStatus,
  DshSourceStatus,
  DshVersionTask,
} from '../../../shared/ipc/dsh';
import type { StoreState } from '../StoreState';

export interface DshSlice {
  /** dsh 版本目录状态（当前选中/已装/最新/是否有更新，含预发布通道） */
  versionStatus: DshVersionStatus | null;
  /** dsh 官方版本目录（正式版/预发布分桶；设置页版本块按需拉取） */
  versionCatalog: DshVersionCatalog | null;
  /** 官方版本目录上次拉取是否失败（用于区分“暂无版本”与“未知”） */
  versionCatalogFailed: boolean;
  /** dsh 下载源状态（bundled / system / running / config） */
  sourceStatus: DshSourceStatus | null;
  /** 当前版本任务真实进度（无任务为 null） */
  versionTask: DshVersionTask | null;
  /** 本次版本任务是否已请求取消（用于抑制取消导致的错误卡片） */
  versionTaskCancelRequested: boolean;
  /** 版本来源“下次启动生效”延迟标记（仅内存态；应用重启后按持久化来源生效） */
  dshVersionSourceDeferred: boolean;

  setDshVersionStatus: (status: DshVersionStatus | null) => void;
  setDshVersionCatalog: (catalog: DshVersionCatalog | null) => void;
  setVersionCatalogFailed: (failed: boolean) => void;
  setDshSourceStatus: (status: DshSourceStatus | null) => void;
  setDshVersionTask: (task: DshVersionTask | null) => void;
  setVersionTaskCancelRequested: (requested: boolean) => void;
  setDshVersionSourceDeferred: (deferred: boolean) => void;
}

export const createDshSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): DshSlice => ({
  versionStatus: null,
  versionCatalog: null,
  versionCatalogFailed: false,
  sourceStatus: null,
  versionTask: null,
  versionTaskCancelRequested: false,
  dshVersionSourceDeferred: false,

  setDshVersionStatus: (status) => set({ versionStatus: status }),
  setDshVersionCatalog: (catalog) => set({ versionCatalog: catalog }),
  setVersionCatalogFailed: (failed) => set({ versionCatalogFailed: failed }),
  setDshSourceStatus: (status) => set({ sourceStatus: status }),
  setDshVersionTask: (task) => set({ versionTask: task }),
  setVersionTaskCancelRequested: (requested) => set({ versionTaskCancelRequested: requested }),
  setDshVersionSourceDeferred: (deferred) => set({ dshVersionSourceDeferred: deferred }),
});
