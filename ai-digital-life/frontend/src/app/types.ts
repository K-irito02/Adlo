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
    getLineCount?: () => number;
  } | null;
  revealLineInCenter: (lineNumber: number) => void;
  revealLinesInCenter?: (startLineNumber: number, endLineNumber: number) => void;
  getVisibleRanges?: () => Array<{
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  }>;
  getScrollTop?: () => number;
  getScrollHeight?: () => number;
  getLayoutInfo?: () => { height: number; width?: number; contentWidth?: number };
  setScrollPosition?: (position: { scrollTop: number }) => void;
  onDidScrollChange?: (listener: () => void) => { dispose(): void };
  onDidChangeHiddenAreas?: (listener: () => void) => { dispose(): void };
  onDidLayoutChange?: (listener: () => void) => { dispose(): void };
  focus?: () => void;
  setPosition?: (position: { lineNumber: number; column: number }) => void;
  setSelection?: (selection: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  }) => void;
};
