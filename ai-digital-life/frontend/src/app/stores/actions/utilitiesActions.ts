import type { StoreApi } from 'zustand';
import type { StoreState } from '../StoreState';
import { captureError } from '../shared';
const SCOPE = 'utilities';

export function createUtilitiesActions(
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState,
) {
  return {
    /**
     * [fetchClipboardHistory - 拉取系统剪贴板历史列表]
     * @reads 无
     * @writes clipboardHistorySlice.clipboardHistory, clipboardHistorySlice.clipboardHistoryLoading
     * @see shared/ipc.ts → clipboard.list
     * @see mock-bridge.ts → clipboard.list
     * @see preview-bridge/index.ts → clipboard.list
     */
    fetchClipboardHistory: async () => {
      set({ clipboardHistoryLoading: true });
      try {
        const result = await window.digitalLife.clipboard.list(200);
        if (result.ok) {
          get().setClipboardHistory(result.data);
        } else {
          captureError(get, result.error, SCOPE);
        }
      } finally {
        set({ clipboardHistoryLoading: false });
      }
    },

    /**
     * [removeClipboardItem - 删除单条剪贴板历史]
     * @reads clipboardHistorySlice.clipboardHistory
     * @writes clipboardHistorySlice.clipboardHistory
     * @see shared/ipc.ts → clipboard.remove
     * @see mock-bridge.ts → clipboard.remove
     * @see preview-bridge/index.ts → clipboard.remove
     */
    removeClipboardItem: async (id: string) => {
      const result = await window.digitalLife.clipboard.remove(id);
      if (result.ok && result.data === true) {
        get().removeClipboardHistoryItem(id);
      } else if (!result.ok) {
        captureError(get, result.error, SCOPE);
      }
    },

    /**
     * [clearAllClipboard - 清空全部剪贴板历史]
     * @reads 无
     * @writes clipboardHistorySlice.clipboardHistory
     * @see shared/ipc.ts → clipboard.clear
     * @see mock-bridge.ts → clipboard.clear
     * @see preview-bridge/index.ts → clipboard.clear
     */
    clearAllClipboard: async () => {
      const result = await window.digitalLife.clipboard.clear();
      if (result.ok) {
        get().clearClipboardHistory();
      } else {
        captureError(get, result.error, SCOPE);
      }
    },

    /**
     * [writeClipboardItem - 把单条剪贴板历史写回系统剪贴板]
     * 图片条目走后端 `/clipboard/write-image`；返回是否写入成功，供 UI 展示 toast。
     * @reads 无
     * @writes 无
     * @see shared/ipc.ts → clipboard.writeImage
     * @see mock-bridge.ts → clipboard.writeImage
     * @see preview-bridge/index.ts → clipboard.writeImage
     */
    writeClipboardItem: async (id: string) => {
      const result = await window.digitalLife.clipboard.writeImage(id);
      if (result.ok && result.data === true) {
        return true;
      }
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
      }
      return false;
    },

    /**
     * [fetchSystemSnapshot - 拉取最新系统资源快照]
     * @reads 无
     * @writes systemMonitorSlice.sysmonSnapshot
     * @see shared/ipc.ts → systemMonitor.snapshot
     * @see mock-bridge.ts → systemMonitor.snapshot
     * @see preview-bridge/index.ts → systemMonitor.snapshot
     */
    fetchSystemSnapshot: async () => {
      const result = await window.digitalLife.systemMonitor.snapshot();
      if (result.ok) {
        get().setSysmonSnapshot(result.data);
      } else {
        captureError(get, result.error, SCOPE);
      }
    },
  };
}
