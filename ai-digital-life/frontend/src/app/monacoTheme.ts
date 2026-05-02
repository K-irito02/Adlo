export const MONACO_THEME_LIGHT = "adl-light";
export const MONACO_THEME_DARK = "adl-dark";

export type MonacoNamespace = {
  editor?: {
    defineTheme?: (
      name: string,
      data: {
        base: "vs" | "vs-dark";
        inherit: boolean;
        rules: Array<{ token: string; foreground?: string; background?: string }>;
        colors: Record<string, string>;
      }
    ) => void;
    setTheme?: (theme: string) => void;
  };
};

function normalizeHexColor(value: string): string | undefined {
  const normalized = value.trim();
  const match = normalized.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (!match) return undefined;

  const hex = match[1];
  if (hex.length === 3 || hex.length === 4) {
    return `#${hex
      .split("")
      .map((part) => `${part}${part}`)
      .join("")
      .toLowerCase()}`;
  }
  return `#${hex.toLowerCase()}`;
}

function toHexByte(value: number): string {
  const bounded = Math.min(255, Math.max(0, Math.round(value)));
  return bounded.toString(16).padStart(2, "0");
}

function normalizeRgbColor(value: string): string | undefined {
  const match = value
    .trim()
    .match(/^rgba?\(\s*(\d{1,3})(?:\s*,\s*|\s+)(\d{1,3})(?:\s*,\s*|\s+)(\d{1,3})(?:(?:\s*,\s*|\s*\/\s*)([\d.]+%?))?\s*\)$/i);
  if (!match) return undefined;

  const [, rRaw, gRaw, bRaw, alphaRaw] = match;
  const r = Number.parseInt(rRaw, 10);
  const g = Number.parseInt(gRaw, 10);
  const b = Number.parseInt(bRaw, 10);
  const alpha =
    alphaRaw == null
      ? 1
      : alphaRaw.endsWith("%")
        ? Number.parseFloat(alphaRaw) / 100
        : Number.parseFloat(alphaRaw);

  if ([r, g, b, alpha].some((part) => Number.isNaN(part))) {
    return undefined;
  }

  const alphaByte = Math.min(255, Math.max(0, Math.round(alpha * 255)));
  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}${alphaByte < 255 ? toHexByte(alphaByte) : ""}`;
}

function normalizeMonacoColor(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.toLowerCase() === "transparent") {
    return "#00000000";
  }
  return normalizeHexColor(trimmed) ?? normalizeRgbColor(trimmed);
}

function readThemeColor(theme: "light" | "dark", name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const probe = document.createElement("div");
  probe.setAttribute("data-theme", theme);
  probe.style.position = "absolute";
  probe.style.opacity = "0";
  probe.style.pointerEvents = "none";
  probe.style.width = "0";
  probe.style.height = "0";
  probe.style.color = `var(${name})`;

  const container = document.body ?? document.documentElement;
  container.appendChild(probe);
  try {
    const computed = getComputedStyle(probe);
    return normalizeMonacoColor(computed.color) ?? normalizeMonacoColor(computed.getPropertyValue(name));
  } finally {
    container.removeChild(probe);
  }
}

function buildMonacoThemeData(theme: "light" | "dark"): {
  base: "vs" | "vs-dark";
  inherit: boolean;
  rules: Array<{ token: string; foreground?: string; background?: string }>;
  colors: Record<string, string>;
} {
  const base = theme === "dark" ? "vs-dark" : "vs";

  const bg = readThemeColor(theme, "--editor-bg") ?? readThemeColor(theme, "--surface") ?? readThemeColor(theme, "--bg");
  const fg = readThemeColor(theme, "--editor-fg") ?? readThemeColor(theme, "--text-primary");
  const lineNumber = readThemeColor(theme, "--editor-lineNumber") ?? readThemeColor(theme, "--text-muted");
  const lineNumberActive = readThemeColor(theme, "--editor-lineNumber-active") ?? readThemeColor(theme, "--text-secondary");
  const cursor = readThemeColor(theme, "--editor-cursor") ?? fg;
  const selection = readThemeColor(theme, "--editor-selection");
  const selectionInactive = readThemeColor(theme, "--editor-selection-inactive");
  const lineHighlight = readThemeColor(theme, "--editor-lineHighlight");
  const findMatch = readThemeColor(theme, "--editor-findMatch");
  const findMatchHighlight = readThemeColor(theme, "--editor-findMatch-highlight");
  const hoverBg = readThemeColor(theme, "--editor-hover-bg") ?? readThemeColor(theme, "--surface-raised") ?? readThemeColor(theme, "--surface");
  const hoverBorder = readThemeColor(theme, "--editor-hover-border") ?? readThemeColor(theme, "--border-default") ?? readThemeColor(theme, "--border");
  const widgetBg = readThemeColor(theme, "--editor-widget-bg") ?? hoverBg;
  const widgetBorder = readThemeColor(theme, "--editor-widget-border") ?? hoverBorder;
  const indentGuide = readThemeColor(theme, "--editor-indentGuide");
  const indentGuideActive = readThemeColor(theme, "--editor-indentGuide-active");
  const whitespace = readThemeColor(theme, "--editor-whitespace");
  const diffInsertBg = readThemeColor(theme, "--editor-diff-insert-bg");
  const diffRemoveBg = readThemeColor(theme, "--editor-diff-remove-bg");
  const foldBackground = readThemeColor(theme, "--editor-fold-bg");
  const foldPlaceholderForeground = readThemeColor(theme, "--editor-fold-placeholder-fg");
  const foldingControl = readThemeColor(theme, "--editor-folding-control");
  const rangeHighlight = readThemeColor(theme, "--editor-range-highlight");
  const rangeHighlightBorder = readThemeColor(theme, "--editor-range-highlight-border");

  const syntaxComment = readThemeColor(theme, "--editor-syntax-comment");
  const syntaxKeyword = readThemeColor(theme, "--editor-syntax-keyword");
  const syntaxString = readThemeColor(theme, "--editor-syntax-string");
  const syntaxNumber = readThemeColor(theme, "--editor-syntax-number");
  const syntaxRegexp = readThemeColor(theme, "--editor-syntax-regexp");
  const syntaxType = readThemeColor(theme, "--editor-syntax-type");
  const syntaxFunction = readThemeColor(theme, "--editor-syntax-function");
  const syntaxVariable = readThemeColor(theme, "--editor-syntax-variable");

  const colors: Record<string, string> = {};
  if (bg) {
    colors["editor.background"] = bg;
    colors["editorGutter.background"] = bg;
    colors["minimap.background"] = bg;
  }
  if (fg) {
    colors["editor.foreground"] = fg;
  }
  if (cursor) {
    colors["editorCursor.foreground"] = cursor;
  }
  if (lineNumber) {
    colors["editorLineNumber.foreground"] = lineNumber;
  }
  if (lineNumberActive) {
    colors["editorLineNumber.activeForeground"] = lineNumberActive;
  }
  if (selection) {
    colors["editor.selectionBackground"] = selection;
  }
  if (selectionInactive) {
    colors["editor.inactiveSelectionBackground"] = selectionInactive;
  }
  if (lineHighlight) {
    colors["editor.lineHighlightBackground"] = lineHighlight;
  }
  if (indentGuide) {
    colors["editorIndentGuide.background"] = indentGuide;
  }
  if (indentGuideActive) {
    colors["editorIndentGuide.activeBackground"] = indentGuideActive;
  }
  if (whitespace) {
    colors["editorWhitespace.foreground"] = whitespace;
  }
  if (findMatch) {
    colors["editor.findMatchBackground"] = findMatch;
  }
  if (findMatchHighlight) {
    colors["editor.findMatchHighlightBackground"] = findMatchHighlight;
  }
  colors["editor.findMatchBorder"] = "#00000000";
  colors["editor.findMatchHighlightBorder"] = "#00000000";
  colors["editor.findRangeHighlightBorder"] = "#00000000";
  if (foldBackground) {
    colors["editor.foldBackground"] = foldBackground;
  }
  if (foldPlaceholderForeground ?? lineNumberActive ?? fg) {
    colors["editor.foldPlaceholderForeground"] =
      foldPlaceholderForeground ?? lineNumberActive ?? fg ?? "inherit";
  }
  colors["editor.lineHighlightBorder"] = "#00000000";
  colors["editor.selectionHighlightBackground"] = "#00000000";
  colors["editor.selectionHighlightBorder"] = "#00000000";
  colors["editor.wordHighlightBackground"] = "#00000000";
  colors["editor.wordHighlightBorder"] = "#00000000";
  colors["editor.wordHighlightStrongBackground"] = "#00000000";
  colors["editor.wordHighlightStrongBorder"] = "#00000000";
  colors["editor.wordHighlightTextBackground"] = "#00000000";
  colors["editor.wordHighlightTextBorder"] = "#00000000";
  colors["editorBracketMatch.background"] = "#00000000";
  colors["editorBracketMatch.border"] = "#00000000";
  if (foldingControl) {
    colors["editorGutter.foldingControlForeground"] = foldingControl;
  }
  if (rangeHighlight) {
    colors["editor.rangeHighlightBackground"] = rangeHighlight;
  }
  if (rangeHighlightBorder) {
    colors["editor.rangeHighlightBorder"] = rangeHighlightBorder;
  }
  if (hoverBg) {
    colors["editorHoverWidget.background"] = hoverBg;
  }
  if (hoverBorder) {
    colors["editorHoverWidget.border"] = hoverBorder;
  }
  if (widgetBg) {
    colors["editorWidget.background"] = widgetBg;
    colors["editorSuggestWidget.background"] = widgetBg;
  }
  if (widgetBorder) {
    colors["editorWidget.border"] = widgetBorder;
    colors["editorSuggestWidget.border"] = widgetBorder;
  }
  if (diffInsertBg) {
    colors["diffEditor.insertedTextBackground"] = diffInsertBg;
    colors["diffEditor.insertedLineBackground"] = diffInsertBg;
    colors["diffEditorGutter.insertedLineBackground"] = diffInsertBg;
  }
  if (diffRemoveBg) {
    colors["diffEditor.removedTextBackground"] = diffRemoveBg;
    colors["diffEditor.removedLineBackground"] = diffRemoveBg;
    colors["diffEditorGutter.removedLineBackground"] = diffRemoveBg;
  }
  colors["diffEditor.modifiedTextBackground"] = "#00000000";
  colors["diffEditor.modifiedLineBackground"] = "#00000000";
  colors["diffEditorGutter.modifiedLineBackground"] = "#00000000";

  colors["diffEditor.insertedTextBorder"] = "#00000000";
  colors["diffEditor.removedTextBorder"] = "#00000000";
  colors["diffEditor.modifiedTextBorder"] = "#00000000";
  colors["diffEditor.insertedLineBorder"] = "#00000000";
  colors["diffEditor.removedLineBorder"] = "#00000000";
  colors["diffEditor.modifiedLineBorder"] = "#00000000";

  colors["diffEditorOverview.insertedForeground"] = "#00000000";
  colors["diffEditorOverview.removedForeground"] = "#00000000";
  colors["diffEditorOverview.modifiedForeground"] = "#00000000";

  colors["diffEditorBorder"] = "#00000000";
  colors["diffEditor.diagonalFillForeground"] = "#00000000";

  const rules: Array<{ token: string; foreground?: string; background?: string }> = [];
  const pushRule = (token: string, foreground?: string) => {
    if (!foreground) return;
    rules.push({ token, foreground: foreground.replace(/^#/, "") });
  };
  pushRule("comment", syntaxComment);
  pushRule("keyword", syntaxKeyword);
  pushRule("string", syntaxString);
  pushRule("number", syntaxNumber);
  pushRule("regexp", syntaxRegexp);
  pushRule("type", syntaxType);
  pushRule("function", syntaxFunction);
  pushRule("variable", syntaxVariable);

  return { base, inherit: true, rules, colors };
}

export function ensureAdlMonacoThemes(monaco: MonacoNamespace) {
  monaco.editor?.defineTheme?.(MONACO_THEME_LIGHT, buildMonacoThemeData("light"));
  monaco.editor?.defineTheme?.(MONACO_THEME_DARK, buildMonacoThemeData("dark"));
}
