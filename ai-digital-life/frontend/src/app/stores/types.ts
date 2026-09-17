// 右侧面板工具 ID。注意：'communicate'（通信面板）为发布前隐藏状态，
// 前端入口（ToolSwitcher + RightPanel）已注释隐藏，但类型必须保留：
// 1. 兼容用户本地持久化的旧 activeRightTool 值（readRightTool 会自动回落到 files）；
// 2. 以后恢复时只需取消两处注释，无需改类型与迁移数据。
// 切勿删除本联合成员，i18n / slice / CSS 同样完整保留。
export type ToolId = 'files' | 'changes' | 'browser' | 'terminal' | 'settings' | 'communicate';
export type ChatMode = 'plan' | 'debug' | 'ask';
export type TerminalProfile = 'powershell' | 'bash' | 'cmd';
export type FilesNavigatorMode = 'tree' | 'search' | 'outline';
export type ChangesNavigatorMode = 'tree' | 'list' | 'outline';
/** 检索文件模式下的结果展示形式：文件树 / 文件列表 /（选中文件的）文档大纲 */
export type FilesSearchViewMode = 'tree' | 'list' | 'outline';
/** 检索文件模式下的检索范围：文件名 / 文件内容 */
export type FilesSearchScope = 'file' | 'content';

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
