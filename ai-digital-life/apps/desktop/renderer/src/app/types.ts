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
};
