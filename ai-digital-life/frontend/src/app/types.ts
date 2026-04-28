export type MonacoEditorRef = {
  getSelection: () => {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  } | null;
  getModel: () => {
    getValueInRange: (range: {
      startLineNumber: number;
      startColumn: number;
      endLineNumber: number;
      endColumn: number;
    }) => string;
  } | null;
  revealLineInCenter: (lineNumber: number) => void;
  revealLinesInCenter?: (startLineNumber: number, endLineNumber: number) => void;
  focus?: () => void;
  setPosition?: (position: { lineNumber: number; column: number }) => void;
  setSelection?: (selection: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  }) => void;
};
