import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";

export const DIFF_INSERT_CLASS = "adl-cm-diff-insert";
export const DIFF_DELETE_CLASS = "adl-cm-diff-delete";
export const AGENT_DECO_INSERT_CLASS = "adl-cm-agent-insert";
export const AGENT_DECO_MODIFY_CLASS = "adl-cm-agent-modify";
export const AGENT_DECO_DELETE_CLASS = "adl-cm-agent-delete";
export const AGENT_GUTTER_INSERT_CLASS = "adl-cm-gutter-insert";
export const AGENT_GUTTER_MODIFY_CLASS = "adl-cm-gutter-modify";
export const AGENT_GUTTER_DELETE_CLASS = "adl-cm-gutter-delete";

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
    .match(
      /^rgba?\(\s*(\d{1,3})(?:\s*,\s*|\s+)(\d{1,3})(?:\s*,\s*|\s+)(\d{1,3})(?:(?:\s*,\s*|\s*\/\s*)([\d.]+%?))?\s*\)$/i,
    );
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

function normalizeColor(value: string | undefined): string | undefined {
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
    return normalizeColor(computed.color) ?? normalizeColor(computed.getPropertyValue(name));
  } finally {
    container.removeChild(probe);
  }
}

interface ThemeColors {
  bg: string;
  fg: string;
  lineNumber: string;
  lineNumberActive: string;
  cursor: string;
  selection: string;
  selectionInactive: string;
  lineHighlight: string;
  findMatch: string;
  findMatchHighlight: string;
  diffInsertBg: string;
  diffRemoveBg: string;
  syntaxComment: string;
  syntaxKeyword: string;
  syntaxString: string;
  syntaxNumber: string;
  syntaxRegexp: string;
  syntaxType: string;
  syntaxFunction: string;
  syntaxVariable: string;
}

function readColors(theme: "light" | "dark"): ThemeColors {
  const bg =
    readThemeColor(theme, "--editor-bg") ??
    readThemeColor(theme, "--surface") ??
    readThemeColor(theme, "--bg") ??
    (theme === "dark" ? "#1e1e1e" : "#ffffff");
  const fg =
    readThemeColor(theme, "--editor-fg") ?? readThemeColor(theme, "--text-primary") ?? (theme === "dark" ? "#d4d4d4" : "#1e1e1e");
  const lineNumber =
    readThemeColor(theme, "--editor-lineNumber") ?? readThemeColor(theme, "--text-muted") ?? (theme === "dark" ? "#6e7681" : "#8b949e");
  const lineNumberActive =
    readThemeColor(theme, "--editor-lineNumber-active") ??
    readThemeColor(theme, "--text-secondary") ??
    (theme === "dark" ? "#e0e0e0" : "#1e1e1e");
  const cursor = readThemeColor(theme, "--editor-cursor") ?? fg;
  const selection = readThemeColor(theme, "--editor-selection") ?? (theme === "dark" ? "#264f78" : "#add6ff");
  const selectionInactive =
    readThemeColor(theme, "--editor-selection-inactive") ?? (theme === "dark" ? "#3a3d41" : "#e5e5e5");
  const lineHighlight =
    readThemeColor(theme, "--editor-lineHighlight") ?? (theme === "dark" ? "#2a2d2e" : "#f3f3f3");
  const findMatch =
    readThemeColor(theme, "--editor-findMatch") ?? (theme === "dark" ? "rgba(96,165,250,0.2)" : "rgba(37,99,235,0.18)");
  const findMatchHighlight =
    readThemeColor(theme, "--editor-findMatch-highlight") ?? (theme === "dark" ? "rgba(96,165,250,0.12)" : "rgba(37,99,235,0.1)");
  const diffInsertBg =
    readThemeColor(theme, "--editor-diff-insert-bg") ?? (theme === "dark" ? "rgba(22,163,74,0.2)" : "rgba(74,222,128,0.2)");
  const diffRemoveBg =
    readThemeColor(theme, "--editor-diff-remove-bg") ?? (theme === "dark" ? "rgba(239,68,68,0.2)" : "rgba(248,113,113,0.2)");
  const syntaxComment =
    readThemeColor(theme, "--editor-syntax-comment") ?? (theme === "dark" ? "#6a9955" : "#6a9955");
  const syntaxKeyword =
    readThemeColor(theme, "--editor-syntax-keyword") ?? (theme === "dark" ? "#569cd6" : "#0000ff");
  const syntaxString =
    readThemeColor(theme, "--editor-syntax-string") ?? (theme === "dark" ? "#ce9178" : "#a31515");
  const syntaxNumber =
    readThemeColor(theme, "--editor-syntax-number") ?? (theme === "dark" ? "#b5cea8" : "#098658");
  const syntaxRegexp =
    readThemeColor(theme, "--editor-syntax-regexp") ?? (theme === "dark" ? "#d16969" : "#811f3f");
  const syntaxType =
    readThemeColor(theme, "--editor-syntax-type") ?? (theme === "dark" ? "#4ec9b0" : "#267f99");
  const syntaxFunction =
    readThemeColor(theme, "--editor-syntax-function") ?? (theme === "dark" ? "#dcdcaa" : "#795e26");
  const syntaxVariable =
    readThemeColor(theme, "--editor-syntax-variable") ?? (theme === "dark" ? "#9cdcfe" : "#001080");

  return {
    bg,
    fg,
    lineNumber,
    lineNumberActive,
    cursor,
    selection,
    selectionInactive,
    lineHighlight,
    findMatch,
    findMatchHighlight,
    diffInsertBg,
    diffRemoveBg,
    syntaxComment,
    syntaxKeyword,
    syntaxString,
    syntaxNumber,
    syntaxRegexp,
    syntaxType,
    syntaxFunction,
    syntaxVariable,
  };
}

function buildEditorTheme(c: ThemeColors): Extension {
  return EditorView.theme(
    {
      "&": {
        backgroundColor: c.bg,
        color: c.fg,
      },
      "&.cm-focused .cm-cursor": {
        borderLeftColor: c.cursor,
      },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
        backgroundColor: c.selection,
      },
      ".cm-gutters": {
        backgroundColor: c.bg,
        color: c.lineNumber,
        borderRight: "none",
      },
      ".cm-activeLineGutter": {
        backgroundColor: c.lineHighlight,
        color: c.lineNumberActive,
      },
      ".cm-activeLine": {
        backgroundColor: c.lineHighlight,
      },
      ".cm-matchingBracket": {
        backgroundColor: c.selection,
        outline: `1px solid ${c.cursor}`,
      },
      ".cm-searchMatch": {
        backgroundColor: c.findMatchHighlight,
      },
      ".cm-searchMatch.cm-searchMatch-selected": {
        backgroundColor: c.findMatch,
      },
      ".cm-selectionBackground": {
        backgroundColor: c.selectionInactive,
      },
      [`.${DIFF_INSERT_CLASS}`]: {
        backgroundColor: c.diffInsertBg,
      },
      [`.${DIFF_DELETE_CLASS}`]: {
        backgroundColor: c.diffRemoveBg,
      },
      [`.${AGENT_DECO_INSERT_CLASS}`]: {
        backgroundColor: c.diffInsertBg,
      },
      [`.${AGENT_DECO_MODIFY_CLASS}`]: {
        backgroundColor: c.selection,
      },
      [`.${AGENT_DECO_DELETE_CLASS}`]: {
        backgroundColor: c.diffRemoveBg,
      },
      [`.${AGENT_GUTTER_INSERT_CLASS}`]: {
        backgroundColor: c.diffInsertBg,
      },
      [`.${AGENT_GUTTER_MODIFY_CLASS}`]: {
        backgroundColor: c.selection,
      },
      [`.${AGENT_GUTTER_DELETE_CLASS}`]: {
        backgroundColor: c.diffRemoveBg,
      },
    },
    { dark: false },
  );
}

function buildHighlightStyle(c: ThemeColors): Extension {
  return syntaxHighlighting(
    HighlightStyle.define([
      { tag: tags.comment, color: c.syntaxComment },
      { tag: tags.keyword, color: c.syntaxKeyword },
      { tag: tags.string, color: c.syntaxString },
      { tag: tags.number, color: c.syntaxNumber },
      { tag: tags.regexp, color: c.syntaxRegexp },
      { tag: tags.typeName, color: c.syntaxType },
      { tag: tags.function(tags.variableName), color: c.syntaxFunction },
      { tag: tags.variableName, color: c.syntaxVariable },
    ]),
  );
}

const diffBaseTheme: Extension = EditorView.baseTheme({
  ".cm-deletedLine": {
    backgroundColor: "var(--editor-diff-remove-bg, rgba(239,68,68,0.2))",
  },
  ".cm-insertedLine": {
    backgroundColor: "var(--editor-diff-insert-bg, rgba(22,163,74,0.2))",
  },
  [`.${DIFF_INSERT_CLASS}`]: {
    backgroundColor: "var(--editor-diff-insert-bg, rgba(22,163,74,0.2))",
  },
  [`.${DIFF_DELETE_CLASS}`]: {
    backgroundColor: "var(--editor-diff-remove-bg, rgba(239,68,68,0.2))",
  },
  [`.${AGENT_DECO_INSERT_CLASS}`]: {
    backgroundColor: "var(--editor-diff-insert-bg, rgba(22,163,74,0.2))",
  },
  [`.${AGENT_DECO_MODIFY_CLASS}`]: {
    backgroundColor: "var(--editor-selection, rgba(37,99,235,0.18))",
  },
  [`.${AGENT_DECO_DELETE_CLASS}`]: {
    backgroundColor: "var(--editor-diff-remove-bg, rgba(239,68,68,0.2))",
  },
  [`.${AGENT_GUTTER_INSERT_CLASS}`]: {
    backgroundColor: "var(--editor-diff-insert-bg, rgba(22,163,74,0.2))",
  },
  [`.${AGENT_GUTTER_MODIFY_CLASS}`]: {
    backgroundColor: "var(--editor-selection, rgba(37,99,235,0.18))",
  },
  [`.${AGENT_GUTTER_DELETE_CLASS}`]: {
    backgroundColor: "var(--editor-diff-remove-bg, rgba(239,68,68,0.2))",
  },
});

let adlLightTheme: Extension[];
let adlDarkTheme: Extension[];

function buildThemeExtensions(theme: "light" | "dark"): Extension[] {
  const colors = readColors(theme);
  const editorTheme = buildEditorTheme(colors);
  const highlightStyle = buildHighlightStyle(colors);
  return [diffBaseTheme, editorTheme, highlightStyle];
}

function ensureThemes(): void {
  if (!adlLightTheme) {
    adlLightTheme = buildThemeExtensions("light");
  }
  if (!adlDarkTheme) {
    adlDarkTheme = buildThemeExtensions("dark");
  }
}

export { adlLightTheme, adlDarkTheme };

export function getThemeExtension(theme: "light" | "dark"): Extension {
  ensureThemes();
  return theme === "dark" ? adlDarkTheme : adlLightTheme;
}

export function rebuildThemes(): void {
  adlLightTheme = buildThemeExtensions("light");
  adlDarkTheme = buildThemeExtensions("dark");
}
