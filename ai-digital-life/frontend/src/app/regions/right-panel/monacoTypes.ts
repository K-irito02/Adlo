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

export type MonacoTextModel = {
  getLineCount(): number;
  getLineMaxColumn?(lineNumber: number): number;
};

export type MonacoMinimapLayoutInfo = {
  minimapWidth?: number;
  minimapCharWidth?: number;
};

export type MonacoEditorLayoutInfo = {
  height: number;
  width?: number;
  contentWidth?: number;
  minimap?: MonacoMinimapLayoutInfo;
};

export interface MonacoEditor {
  deltaDecorations(oldDecorations: string[], newDecorations: MonacoDecoration[]): string[];
  updateOptions(options: unknown): void;
  getSelection?(): {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  } | null;
  getScrollTop(): number;
  getScrollLeft?(): number;
  getScrollHeight(): number;
  getLayoutInfo(): MonacoEditorLayoutInfo;
  setScrollPosition(position: { scrollTop: number }): void;
  getVisibleRanges?(): MonacoRange[];
  onDidScrollChange?(listener: () => void): { dispose(): void };
  onDidChangeHiddenAreas?(listener: () => void): { dispose(): void };
  onDidLayoutChange?(listener: () => void): { dispose(): void };
  getModel?(): MonacoTextModel | null;
  getDomNode?(): HTMLElement | null;
  getTopForLineNumber?(lineNumber: number): number;
  revealLineInCenter?(lineNumber: number): void;
  revealLinesInCenter?(startLineNumber: number, endLineNumber: number): void;
  focus?(): void;
  setPosition?(position: { lineNumber: number; column: number }): void;
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
  Range?: new (startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number) => MonacoRange;
  editor?: MonacoEditorNamespace;
}

export type MonacoWindow = typeof window & {
  monaco?: MonacoNamespace;
};

function isMonacoRangeConstructor(
  value: MonacoNamespace["Range"] | unknown
): value is NonNullable<MonacoNamespace["Range"]> {
  return typeof value === "function";
}

export function getMonacoFromWindow(): MonacoNamespace | undefined {
  return (window as MonacoWindow).monaco;
}

export function getMinimapPosition(monaco: unknown): number {
  return (monaco as { editor?: { MinimapPosition?: { Inline?: number } } } | undefined)?.editor?.MinimapPosition?.Inline ?? 1;
}

export function createMonacoRange(
  monaco: MonacoNamespace,
  startLine: number,
  startColumn: number,
  endLine: number,
  endColumn: number
): MonacoRange {
  const RangeConstructor = monaco.Range;
  if (!isMonacoRangeConstructor(RangeConstructor)) {
    throw new Error("Monaco Range constructor is unavailable");
  }
  return new RangeConstructor(startLine, startColumn, endLine, endColumn);
}

export function getEditorVisibleStartLine(editor: MonacoEditor | null | undefined): number | undefined {
  const firstVisibleRange = editor?.getVisibleRanges?.()?.[0];
  return firstVisibleRange?.startLineNumber;
}

export function navigateEditorToLine(editor: MonacoEditor | null | undefined, line: number) {
  if (!editor) {
    return;
  }
  editor.revealLineInCenter?.(line);
  editor.setPosition?.({ lineNumber: line, column: 1 });
  editor.focus?.();
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

/**
 * Convert a CSS color string (rgba/rgb/hex) to Monaco-compatible hex format (#RRGGBBAA).
 *
 * Monaco's `ModelDecorationMinimapOptions._resolveColor()` calls `Color.fromHex()`,
 * which ONLY accepts hex strings (#RGB, #RGBA, #RRGGBB, #RRGGBBAA). Any non-hex
 * string causes `parseHex` to return null, and `Color.fromHex()` silently falls
 * back to `Color.red` — making ALL minimap decorations appear red.
 */
export function cssColorToHex(cssColor: string): string {
  const trimmed = cssColor.trim();

  // Already hex format — return as-is
  if (trimmed.startsWith("#")) {
    return trimmed;
  }

  // Parse rgba(r, g, b, a) format
  const rgbaMatch = trimmed.match(
    /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/
  );
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1], 10);
    const g = parseInt(rgbaMatch[2], 10);
    const b = parseInt(rgbaMatch[3], 10);
    const a = parseFloat(rgbaMatch[4]);
    const alphaHex = Math.round(Math.min(1, Math.max(0, a)) * 255)
      .toString(16)
      .padStart(2, "0");
    return (
      "#" +
      r.toString(16).padStart(2, "0") +
      g.toString(16).padStart(2, "0") +
      b.toString(16).padStart(2, "0") +
      alphaHex
    );
  }

  // Parse rgb(r, g, b) format (alpha = 1)
  const rgbMatch = trimmed.match(
    /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/
  );
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10);
    const g = parseInt(rgbMatch[2], 10);
    const b = parseInt(rgbMatch[3], 10);
    return (
      "#" +
      r.toString(16).padStart(2, "0") +
      g.toString(16).padStart(2, "0") +
      b.toString(16).padStart(2, "0")
    );
  }

  // Fallback: return as-is and hope Monaco can handle it
  return trimmed;
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
