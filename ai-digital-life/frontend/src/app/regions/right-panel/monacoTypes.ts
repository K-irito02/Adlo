export type MonacoRange = {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
};

export type MonacoDecorationOptions = {
  isWholeLine: boolean;
  className: string;
  minimap?: {
    color?: string;
    darkColor?: string;
    position: number;
  };
  zIndex: number;
};

export type MonacoDecoration = {
  range: MonacoRange | unknown;
  options: MonacoDecorationOptions;
};

export interface MonacoEditor {
  deltaDecorations(oldDecorations: string[], newDecorations: MonacoDecoration[]): string[];
  updateOptions(options: unknown): void;
  getScrollTop(): number;
  getScrollHeight(): number;
  getLayoutInfo(): { height: number; width?: number; contentWidth?: number };
  setScrollPosition(position: { scrollTop: number }): void;
  onDidScrollChange?(listener: () => void): { dispose(): void };
  getModel?(): { getLineCount(): number } | null;
  getDomNode?(): HTMLElement | null;
  getTopForLineNumber?(lineNumber: number): number;
}

export interface MonacoDiffEditor {
  updateOptions(opts: unknown): void;
  getModifiedEditor(): MonacoEditor | null;
  getOriginalEditor(): MonacoEditor | null;
  onDidUpdateDiff(listener: () => void): { dispose(): void };
  layout(dimension?: { width: number; height: number }): void;
  getDiffInformation?(): MonacoDiffChange[];
}

export type MonacoDiffChange = {
  originalStartLineNumber: number;
  originalEndLineNumber: number;
  modifiedStartLineNumber: number;
  modifiedEndLineNumber: number;
};

export type MonacoMinimapPosition = {
  Inline: number;
};

export interface MonacoEditorNamespace {
  MinimapPosition?: MonacoMinimapPosition;
}

export interface MonacoNamespace {
  Range: new (startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number) => MonacoRange;
  editor?: MonacoEditorNamespace;
}

export type MonacoWindow = typeof window & {
  monaco?: MonacoNamespace;
};

export function getMonacoFromWindow(): MonacoNamespace | undefined {
  return (window as MonacoWindow).monaco;
}

export function getMinimapPosition(monaco: MonacoNamespace | undefined): number {
  return monaco?.editor?.MinimapPosition?.Inline ?? 1;
}

export function createMonacoRange(
  monaco: MonacoNamespace,
  startLine: number,
  startColumn: number,
  endLine: number,
  endColumn: number
): MonacoRange {
  return new monaco.Range(startLine, startColumn, endLine, endColumn);
}

export function isDiffEditor(value: unknown): value is MonacoDiffEditor {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.getModifiedEditor === "function" &&
    typeof obj.getOriginalEditor === "function" &&
    typeof obj.updateOptions === "function" &&
    typeof obj.onDidUpdateDiff === "function" &&
    typeof obj.layout === "function"
  );
}

export function isMonacoEditor(value: unknown): value is MonacoEditor {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.deltaDecorations === "function" &&
    typeof obj.updateOptions === "function" &&
    typeof obj.getScrollTop === "function" &&
    typeof obj.getScrollHeight === "function" &&
    typeof obj.getLayoutInfo === "function" &&
    typeof obj.setScrollPosition === "function"
  );
}
