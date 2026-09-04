/**
 * 剪贴板历史切片
 * 管理系统剪贴板历史条目列表与搜索过滤状态
 */
import type { ClipboardItem } from '@ai-digital-life/kernel';
import type { StoreState } from '../StoreState';

export interface ClipboardHistorySlice {
  clipboardHistory: ClipboardItem[];
  clipboardHistoryLoading: boolean;
  clipboardSearch: string;

  setClipboardHistory: (items: ClipboardItem[]) => void;
  clearClipboardHistory: () => void;
  removeClipboardHistoryItem: (id: string) => void;
  setClipboardSearch: (query: string) => void;
}

export const createClipboardHistorySlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): ClipboardHistorySlice => ({
  clipboardHistory: [],
  clipboardHistoryLoading: false,
  clipboardSearch: '',

  setClipboardHistory: (items) => set({ clipboardHistory: items }),
  clearClipboardHistory: () => set({ clipboardHistory: [] }),
  removeClipboardHistoryItem: (id) =>
    set((state) => ({
      clipboardHistory: state.clipboardHistory.filter((item) => item.id !== id),
    })),
  setClipboardSearch: (query) => set({ clipboardSearch: query }),
});
