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
