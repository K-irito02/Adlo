import type { DshVersionStatus, DshSourceStatus } from '../../../shared/ipc/dsh';
import type { StoreState } from '../StoreState';

export interface DshSlice {
  /** dsh 进程是否就绪（true=已拉起并承载于一个普通浏览器标签）。WebView 归浏览器池
   * 所有，本切片不持有任何视图状态（无专属视图/宿主分支）。 */
  isOpen: boolean;
  /** 当前 dsh 进程就绪 URL（null 表示未拉起） */
  url: string | null;
  /** dsh 版本目录状态（当前选中/已装/最新/是否有更新） */
  versionStatus: DshVersionStatus | null;
  /** dsh 下载源状态（bundled / system / running / config） */
  sourceStatus: DshSourceStatus | null;

  setDshOpen: (open: boolean) => void;
  setDshUrl: (url: string | null) => void;
  setDshVersionStatus: (status: DshVersionStatus | null) => void;
  setDshSourceStatus: (status: DshSourceStatus | null) => void;
}

export const createDshSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): DshSlice => ({
  isOpen: false,
  url: null,
  versionStatus: null,
  sourceStatus: null,

  setDshOpen: (open) => set({ isOpen: open }),
  setDshUrl: (url) => set({ url }),
  setDshVersionStatus: (status) => set({ versionStatus: status }),
  setDshSourceStatus: (status) => set({ sourceStatus: status }),
});
