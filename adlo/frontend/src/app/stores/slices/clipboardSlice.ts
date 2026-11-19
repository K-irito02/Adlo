import type { StoreState } from '../StoreState';

export interface ClipboardSlice {
  clipboardOperation: 'cut' | 'copy' | null;
  clipboardSourcePath: string | null;
  /**
   * 剪贴板条目的来源工作区根：跨工作区粘贴/移动时必须按来源根解析源路径。
   * 缺省为 `null` 时按当前激活工作区解析（非工作区树通用菜单的回落语义）。
   */
  clipboardSourceWorkspacePath: string | null;

  setClipboard: (op: 'cut' | 'copy', path: string, sourceWorkspacePath?: string) => void;
  clearClipboard: () => void;
}

export const createClipboardSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): ClipboardSlice => ({
  clipboardOperation: null,
  clipboardSourcePath: null,
  clipboardSourceWorkspacePath: null,

  setClipboard: (op, path, sourceWorkspacePath) =>
    set({
      clipboardOperation: op,
      clipboardSourcePath: path,
      clipboardSourceWorkspacePath: sourceWorkspacePath ?? null,
    }),

  clearClipboard: () =>
    set({
      clipboardOperation: null,
      clipboardSourcePath: null,
      clipboardSourceWorkspacePath: null,
    }),
});
