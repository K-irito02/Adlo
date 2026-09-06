import type { DshVersionStatus, DshSourceStatus } from '../../../shared/ipc/dsh';
import type { StoreState } from '../StoreState';

export interface DshSlice {
  /** dsh 中间区宿主是否打开（true=铺满中间区，false=欢迎引导页） */
  isOpen: boolean;
  /** 当前 dsh 进程就绪 URL（null 表示未拉起） */
  url: string | null;
  /** dsh 版本目录状态（当前选中/已装/最新/是否有更新） */
  versionStatus: DshVersionStatus | null;
  /** 关闭 dsh 时的选择对话框（保留进程 / 彻底退出）可见性 */
  closeDialogVisible: boolean;
  /** dsh 下载源状态（bundled / system / running / config） */
  sourceStatus: DshSourceStatus | null;
  /** dsh 设置模态框可见性 */
  settingsModalVisible: boolean;

  setDshOpen: (open: boolean) => void;
  setDshUrl: (url: string | null) => void;
  setDshVersionStatus: (status: DshVersionStatus | null) => void;
  setDshCloseDialogVisible: (visible: boolean) => void;
  setDshSourceStatus: (status: DshSourceStatus | null) => void;
  setSettingsModalVisible: (visible: boolean) => void;
}

export const createDshSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): DshSlice => ({
  isOpen: false,
  url: null,
  versionStatus: null,
  closeDialogVisible: false,
  sourceStatus: null,
  settingsModalVisible: false,

  setDshOpen: (open) => set({ isOpen: open }),
  setDshUrl: (url) => set({ url }),
  setDshVersionStatus: (status) => set({ versionStatus: status }),
  setDshCloseDialogVisible: (visible) => set({ closeDialogVisible: visible }),
  setDshSourceStatus: (status) => set({ sourceStatus: status }),
  setSettingsModalVisible: (visible) => set({ settingsModalVisible: visible }),
});
