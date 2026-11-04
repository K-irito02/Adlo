import type { StoreState } from '../StoreState';

export interface ClipboardSlice {
  clipboardOperation: 'cut' | 'copy' | null;
  clipboardSourcePath: string | null;
  clipboardSourceKind: 'file' | 'directory' | null;

  setClipboard: (op: 'cut' | 'copy', path: string, kind: 'file' | 'directory') => void;
  clearClipboard: () => void;
}

export const createClipboardSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): ClipboardSlice => ({
  clipboardOperation: null,
  clipboardSourcePath: null,
  clipboardSourceKind: null,

  setClipboard: (op, path, kind) =>
    set({
      clipboardOperation: op,
      clipboardSourcePath: path,
      clipboardSourceKind: kind,
    }),

  clearClipboard: () =>
    set({
      clipboardOperation: null,
      clipboardSourcePath: null,
      clipboardSourceKind: null,
    }),
});
