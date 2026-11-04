/**
 * 剪贴板历史切片
 * 管理系统剪贴板历史条目列表与搜索过滤状态
 */
import type { ClipboardItem } from '@adlo/kernel';
import type { StoreState } from '../StoreState';

export interface ClipboardHistorySlice {
  clipboardHistory: ClipboardItem[];
  clipboardHistoryLoading: boolean;
  clipboardSearch: string;
  clipboardSearchOpen: boolean;
  clipboardMatchCase: boolean;
  clipboardMatchWholeWord: boolean;
  clipboardUseRegex: boolean;
  clipboardKindFilter: string;

  setClipboardHistory: (items: ClipboardItem[]) => void;
  clearClipboardHistory: () => void;
  removeClipboardHistoryItem: (id: string) => void;
  replaceClipboardHistoryItem: (item: ClipboardItem) => void;
  setClipboardSearch: (query: string) => void;
  setClipboardSearchOpen: (open: boolean) => void;
  setClipboardMatchCase: (value: boolean) => void;
  setClipboardMatchWholeWord: (value: boolean) => void;
  setClipboardUseRegex: (value: boolean) => void;
  setClipboardKindFilter: (kind: string) => void;
}

export const createClipboardHistorySlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): ClipboardHistorySlice => ({
  clipboardHistory: [],
  clipboardHistoryLoading: false,
  clipboardSearch: '',
  clipboardSearchOpen: false,
  clipboardMatchCase: false,
  clipboardMatchWholeWord: false,
  clipboardUseRegex: false,
  clipboardKindFilter: 'all',

  setClipboardHistory: (items) => set({ clipboardHistory: items }),
  clearClipboardHistory: () => set({ clipboardHistory: [] }),
  removeClipboardHistoryItem: (id) =>
    set((state) => ({
      clipboardHistory: state.clipboardHistory.filter((item) => item.id !== id),
    })),
  replaceClipboardHistoryItem: (item) =>
    set((state) => ({
      clipboardHistory: state.clipboardHistory.map((it) => (it.id === item.id ? item : it)),
    })),
  setClipboardSearch: (query) => set({ clipboardSearch: query }),
  setClipboardSearchOpen: (open) => set({ clipboardSearchOpen: open }),
  setClipboardMatchCase: (value) => set({ clipboardMatchCase: value }),
  setClipboardMatchWholeWord: (value) => set({ clipboardMatchWholeWord: value }),
  setClipboardUseRegex: (value) => set({ clipboardUseRegex: value }),
  setClipboardKindFilter: (kind) => set({ clipboardKindFilter: kind }),
});
