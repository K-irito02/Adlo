import type { StoreState } from '../StoreState';

export interface ClipboardSlice {
  clipboardOperation: 'cut' | 'copy' | null;
  clipboardSourcePath: string | null;
  clipboardSourceKind: 'file' | 'directory' | null;
  /**
   * 剪贴板条目的来源工作区根：跨工作区粘贴/移动时必须按来源根解析源路径。
   * 缺省（历史调用点未传）时按目标工作区根解析，保持旧行为。
   */
  clipboardSourceWorkspacePath: string | null;

  setClipboard: (
    op: 'cut' | 'copy',
    path: string,
    kind: 'file' | 'directory',
    sourceWorkspacePath?: string,
  ) => void;
  clearClipboard: () => void;
}

export const createClipboardSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): ClipboardSlice => ({
  clipboardOperation: null,
  clipboardSourcePath: null,
  clipboardSourceKind: null,
  clipboardSourceWorkspacePath: null,

  setClipboard: (op, path, kind, sourceWorkspacePath) =>
    set({
      clipboardOperation: op,
      clipboardSourcePath: path,
      clipboardSourceKind: kind,
      clipboardSourceWorkspacePath: sourceWorkspacePath ?? null,
    }),

  clearClipboard: () =>
    set({
      clipboardOperation: null,
      clipboardSourcePath: null,
      clipboardSourceKind: null,
      clipboardSourceWorkspacePath: null,
    }),
});
