export interface ClipboardSlice {
  clipboardOperation: "cut" | "copy" | null;
  clipboardSourcePath: string | null;
  clipboardSourceKind: "file" | "directory" | null;

  setClipboard: (op: "cut" | "copy", path: string, kind: "file" | "directory") => void;
  clearClipboard: () => void;
}

export const createClipboardSlice = (
  set: (partial: Partial<ClipboardSlice> | ((state: ClipboardSlice) => Partial<ClipboardSlice>)) => void,
  get: () => ClipboardSlice
): ClipboardSlice => ({
  clipboardOperation: null,
  clipboardSourcePath: null,
  clipboardSourceKind: null,

  setClipboard: (op, path, kind) => set({
    clipboardOperation: op,
    clipboardSourcePath: path,
    clipboardSourceKind: kind
  }),

  clearClipboard: () => set({
    clipboardOperation: null,
    clipboardSourcePath: null,
    clipboardSourceKind: null
  })
});
