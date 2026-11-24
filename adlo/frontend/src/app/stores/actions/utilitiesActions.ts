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
    fetchClipboardHistory: async (background = false) => {
      if (!background) {
        set({ clipboardHistoryLoading: true });
      }
      try {
        // 500 与后端 `adl_clipboard::MAX_HISTORY_ITEMS` 及 `GET /clipboard/list` 的上限对齐：
        // 存储层超出即按最旧优先裁剪，读取窗口覆盖全部保留条目。
        const result = await window.digitalLife.clipboard.list(500);
        if (result.ok) {
          get().setClipboardHistory(result.data);
        } else {
          captureError(get, result.error, SCOPE);
        }
      } finally {
        if (!background) {
          set({ clipboardHistoryLoading: false });
        }
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
     * 按 kind 分发 text/html/rtf/image，走后端 `/clipboard/write`；返回是否写入成功，供 UI 展示 toast。
     * @reads 无
     * @writes 无
     * @see shared/ipc.ts → clipboard.write
     * @see mock-bridge.ts → clipboard.write
     * @see preview-bridge/index.ts → clipboard.write
     */
    writeClipboardItem: async (id: string) => {
      const result = await window.digitalLife.clipboard.write(id);
      if (result.ok && result.data === true) {
        return true;
      }
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
      }
      return false;
    },

    /**
     * [updateClipboardItem - 保存一条文本条目的编辑结果]
     * 文本与富文本（html）条目都走这里：改的都是纯文本侧 `content`
     * （html 的 sidecar 只由捕获写入，编辑不动它）。
     * 成功后用返回的新条目原位替换历史列表中的对应项（保持 createdAt → 位置不变）。
     * @reads 无
     * @writes clipboardHistorySlice.clipboardHistory
     * @see shared/ipc.ts → clipboard.update
     * @see mock-bridge.ts → clipboard.update
     * @see preview-bridge/index.ts → clipboard.update
     */
    updateClipboardItem: async (id: string, content: string) => {
      const result = await window.digitalLife.clipboard.update(id, content);
      if (result.ok) {
        get().replaceClipboardHistoryItem(result.data);
        return true;
      }
      captureError(get, result.error, SCOPE);
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
