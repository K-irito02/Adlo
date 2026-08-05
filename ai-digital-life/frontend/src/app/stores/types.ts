export type ToolId =
  | 'files'
  | 'changes'
  | 'browser'
  | 'terminal'
  | 'audit'
  | 'settings'
  | 'ci'
  | 'communicate';
export type ChatMode = 'plan' | 'debug' | 'ask';
export type TerminalProfile = 'powershell' | 'bash' | 'cmd';
export type FilesNavigatorMode = 'tree' | 'search' | 'outline';
export type ChangesNavigatorMode = 'tree' | 'list' | 'outline';

export interface ContextChip {
  id: string;
  kind: 'file' | 'doc' | 'url' | 'codebase' | 'skill' | 'model' | 'mcp';
  label: string;
  detail?: string;
}

export interface BrowserTabState {
  id: string;
  title: string;
  url: string;
  pinned?: boolean;
}

export interface BrowserBookmark {
  url: string;
  title: string;
}

export interface BrowserHistoryEntry {
  id: string;
  url: string;
  title: string;
  visitedAt: number;
}
export interface EditorPosition {
  lineNumber: number;
  column: number;
}

export interface EditorSelection {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

export interface EditorRange {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

export interface EditorModel {
  getValueInRange: (range: EditorRange) => string;
  getLineCount: () => number;
  getLineMaxColumn?: (lineNumber: number) => number;
}

export interface Disposable {
  dispose(): void;
}

export interface ScrollState {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

export interface EditorRef {
  getSelection(): EditorSelection | null;
  getModel(): EditorModel | null;
  revealLineInCenter(lineNumber: number): void;
  revealLinesInCenter?(startLineNumber: number, endLineNumber: number): void;
  getVisibleRanges(): EditorRange[];
  getScrollTop(): number;
  getScrollHeight(): number;
  getLayoutInfo(): { height: number; width?: number; contentWidth?: number };
  setScrollPosition(position: { scrollTop: number }): void;
  onDidScrollChange(listener: () => void): Disposable;
  onDidChangeHiddenAreas?(listener: () => void): Disposable;
  onDidLayoutChange?(listener: () => void): Disposable;
  focus(): void;
  setPosition(position: EditorPosition): void;
  setSelection?(selection: EditorSelection): void;
  getTopForLineNumber?(lineNumber: number): number;
  getDomNode?(): HTMLElement | null;
  getView?(): unknown;
}

export interface DiffEditorRef {
  getModifiedEditor(): EditorRef | null;
  getOriginalEditor(): EditorRef | null;
  onDidUpdateDiff(listener: () => void): Disposable;
  layout(dimension?: { width: number; height: number }): void;
  updateOptions(opts: unknown): void;
}

export type MonacoEditorRef = EditorRef;
