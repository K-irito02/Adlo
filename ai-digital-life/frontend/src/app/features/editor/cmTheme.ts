import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { EditorState, type Extension } from '@codemirror/state';

export const AGENT_DECO_INSERT_CLASS = 'adl-cm-agent-insert';
export const AGENT_DECO_MODIFY_CLASS = 'adl-cm-agent-modify';
export const AGENT_DECO_DELETE_CLASS = 'adl-cm-agent-delete';
export const AGENT_DECO_INSERT_BLOCK_CLASS = 'adl-cm-agent-block-insert';
export const AGENT_DECO_MODIFY_BLOCK_CLASS = 'adl-cm-agent-block-modify';
export const AGENT_DECO_DELETE_BLOCK_CLASS = 'adl-cm-agent-block-delete';

function normalizeHexColor(value: string): string | undefined {
  const normalized = value.trim();
  const match = normalized.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (!match) return undefined;
  const hex = match[1];
  if (hex.length === 3 || hex.length === 4) {
    return `#${hex
      .split('')
      .map((part) => `${part}${part}`)
      .join('')
      .toLowerCase()}`;
  }
  return `#${hex.toLowerCase()}`;
}

function toHexByte(value: number): string {
  const bounded = Math.min(255, Math.max(0, Math.round(value)));
  return bounded.toString(16).padStart(2, '0');
}

function normalizeRgbColor(value: string): string | undefined {
  const match = value
    .trim()
    .match(
      /^rgba?\(\s*(\d{1,3})(?:\s*,\s*|\s+)(\d{1,3})(?:\s*,\s*|\s+)(\d{1,3})(?:(?:\s*,\s*|\s*\/\s*)([\d.]+%?))?\s*\)$/i
    );
  if (!match) return undefined;
  const [, rRaw, gRaw, bRaw, alphaRaw] = match;
  const r = Number.parseInt(rRaw, 10);
  const g = Number.parseInt(gRaw, 10);
  const b = Number.parseInt(bRaw, 10);
  const alpha =
    alphaRaw == null
      ? 1
      : alphaRaw.endsWith('%')
        ? Number.parseFloat(alphaRaw) / 100
        : Number.parseFloat(alphaRaw);
  if ([r, g, b, alpha].some((part) => Number.isNaN(part))) {
    return undefined;
  }
  const alphaByte = Math.min(255, Math.max(0, Math.round(alpha * 255)));
  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}${alphaByte < 255 ? toHexByte(alphaByte) : ''}`;
}

function normalizeColor(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.toLowerCase() === 'transparent') {
    return '#00000000';
  }
  return normalizeHexColor(trimmed) ?? normalizeRgbColor(trimmed);
}

function readThemeColor(theme: 'light' | 'dark', name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;

  const html = document.documentElement;
  const originalTheme = html.getAttribute('data-theme');

  // 临时设置根元素的 data-theme 属性，确保读取正确的 CSS 变量
  html.setAttribute('data-theme', theme);

  const probe = document.createElement('div');
  probe.style.position = 'absolute';
  probe.style.opacity = '0';
  probe.style.pointerEvents = 'none';
  probe.style.width = '0';
  probe.style.height = '0';
  probe.style.color = `var(${name})`;

  const container = document.body ?? document.documentElement;
  container.appendChild(probe);

  try {
    const computed = getComputedStyle(probe);
    return normalizeColor(computed.color) ?? normalizeColor(computed.getPropertyValue(name));
  } finally {
    container.removeChild(probe);
    // 恢复原来的主题
    if (originalTheme === null) {
      html.removeAttribute('data-theme');
    } else {
      html.setAttribute('data-theme', originalTheme);
    }
  }
}

interface ThemeColors {
  bg: string;
  fg: string;
  gutterBg: string;
  gutterBorder: string;
  lineNumber: string;
  lineNumberActive: string;
  cursor: string;
  selection: string;
  selectionInactive: string;
  lineHighlight: string;
  findMatch: string;
  findMatchHighlight: string;
  indentGuide: string;
  indentGuideActive: string;
  foldPlaceholder: string;
  syntaxComment: string;
  syntaxKeyword: string;
  syntaxString: string;
  syntaxNumber: string;
  syntaxRegexp: string;
  syntaxType: string;
  syntaxFunction: string;
  syntaxVariable: string;
  syntaxProperty: string;
  syntaxHeading: string;
  syntaxStrong: string;
  syntaxEmphasis: string;
  syntaxLink: string;
  diffInsertBg: string;
  diffRemoveBg: string;
}

function readColors(theme: 'light' | 'dark'): ThemeColors {
  const bg =
    readThemeColor(theme, '--editor-bg') ??
    readThemeColor(theme, '--surface') ??
    readThemeColor(theme, '--bg') ??
    (theme === 'dark' ? '#141414' : '#f8f8f8');
  const fg =
    readThemeColor(theme, '--editor-fg') ??
    readThemeColor(theme, '--text-primary') ??
    (theme === 'dark' ? '#d4d4d4' : '#1e1e1e');
  const gutterBg =
    readThemeColor(theme, '--editor-gutter-bg') ?? (theme === 'dark' ? '#141414' : '#f8f8f8');
  const gutterBorder =
    readThemeColor(theme, '--editor-gutter-border') ??
    (theme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(34,34,34,0.15)');
  const lineNumber =
    readThemeColor(theme, '--editor-lineNumber') ??
    readThemeColor(theme, '--text-muted') ??
    (theme === 'dark' ? '#6e7681' : '#8b949e');
  const lineNumberActive =
    readThemeColor(theme, '--editor-lineNumber-active') ??
    readThemeColor(theme, '--text-secondary') ??
    (theme === 'dark' ? '#e0e0e0' : '#1e1e1e');
  const cursor = readThemeColor(theme, '--editor-cursor') ?? fg;
  const selection =
    readThemeColor(theme, '--editor-selection') ?? (theme === 'dark' ? '#264f78' : '#add6ff');
  const selectionInactive =
    readThemeColor(theme, '--editor-selection-inactive') ??
    (theme === 'dark' ? '#3a3d41' : '#e5e5e5');
  const lineHighlight =
    readThemeColor(theme, '--editor-lineHighlight') ??
    (theme === 'dark' ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.028)');
  const findMatch =
    readThemeColor(theme, '--editor-findMatch') ??
    (theme === 'dark' ? 'rgba(96,165,250,0.22)' : 'rgba(37,99,235,0.2)');
  const findMatchHighlight =
    readThemeColor(theme, '--editor-findMatch-highlight') ??
    (theme === 'dark' ? 'rgba(96,165,250,0.12)' : 'rgba(37,99,235,0.1)');
  const indentGuide =
    readThemeColor(theme, '--editor-indentGuide') ??
    (theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)');
  const indentGuideActive =
    readThemeColor(theme, '--editor-indentGuide-active') ??
    (theme === 'dark' ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.12)');
  const foldPlaceholder =
    readThemeColor(theme, '--editor-fold-placeholder') ??
    (theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)');
  const syntaxComment =
    readThemeColor(theme, '--editor-syntax-comment') ?? (theme === 'dark' ? '#6b7b8d' : '#6a737d');
  const syntaxKeyword =
    readThemeColor(theme, '--editor-syntax-keyword') ?? (theme === 'dark' ? '#c678dd' : '#a626a4');
  const syntaxString =
    readThemeColor(theme, '--editor-syntax-string') ?? (theme === 'dark' ? '#98c379' : '#50a14f');
  const syntaxNumber =
    readThemeColor(theme, '--editor-syntax-number') ?? (theme === 'dark' ? '#d19a66' : '#986801');
  const syntaxRegexp =
    readThemeColor(theme, '--editor-syntax-regexp') ?? (theme === 'dark' ? '#e06c75' : '#e45649');
  const syntaxType =
    readThemeColor(theme, '--editor-syntax-type') ?? (theme === 'dark' ? '#e5c07b' : '#c18401');
  const syntaxFunction =
    readThemeColor(theme, '--editor-syntax-function') ?? (theme === 'dark' ? '#61afef' : '#4078f2');
  const syntaxVariable =
    readThemeColor(theme, '--editor-syntax-variable') ?? (theme === 'dark' ? '#e06c75' : '#e45649');
  const syntaxProperty =
    readThemeColor(theme, '--editor-syntax-property') ?? (theme === 'dark' ? '#e06c75' : '#e45649');
  const syntaxHeading =
    readThemeColor(theme, '--editor-syntax-heading') ?? (theme === 'dark' ? '#61afef' : '#4078f2');
  const syntaxStrong = readThemeColor(theme, '--editor-syntax-strong') ?? fg;
  const syntaxEmphasis =
    readThemeColor(theme, '--editor-syntax-emphasis') ?? (theme === 'dark' ? '#c678dd' : '#a626a4');
  const syntaxLink =
    readThemeColor(theme, '--editor-syntax-link') ?? (theme === 'dark' ? '#61afef' : '#4078f2');

  const diffInsertBg =
    readThemeColor(theme, '--editor-diff-insert-bg') ??
    (theme === 'dark' ? 'rgba(74,222,128,0.12)' : 'rgba(34,197,94,0.12)');
  const diffRemoveBg =
    readThemeColor(theme, '--editor-diff-remove-bg') ??
    (theme === 'dark' ? 'rgba(248,113,113,0.12)' : 'rgba(239,68,68,0.12)');

  return {
    bg,
    fg,
    gutterBg,
    gutterBorder,
    lineNumber,
    lineNumberActive,
    cursor,
    selection,
    selectionInactive,
    lineHighlight,
    findMatch,
    findMatchHighlight,
    indentGuide,
    indentGuideActive,
    foldPlaceholder,
    syntaxComment,
    syntaxKeyword,
    syntaxString,
    syntaxNumber,
    syntaxRegexp,
    syntaxType,
    syntaxFunction,
    syntaxVariable,
    syntaxProperty,
    syntaxHeading,
    syntaxStrong,
    syntaxEmphasis,
    syntaxLink,
    diffInsertBg,
    diffRemoveBg,
  };
}

function buildEditorTheme(c: ThemeColors, theme: 'light' | 'dark'): Extension {
  return EditorView.theme(
    {
      '&': {
        backgroundColor: c.bg,
        color: c.fg,
        lineHeight: '1.65',
        outline: 'none',
      },
      '&.cm-focused': {
        outline: 'none',
      },
      '.cm-scroller': {
        backgroundColor: c.bg,
      },
      '.cm-content': {
        fontFamily:
          "var(--font-mono, 'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'SF Mono', 'Consolas', monospace)",
        caretColor: c.cursor,
        outline: 'none',
      },
      '&.cm-focused .cm-cursor': {
        borderLeftColor: c.cursor,
        borderLeftWidth: '2px',
      },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
        backgroundColor: c.selection,
      },
      '.cm-gutters': {
        backgroundColor: c.gutterBg,
        color: c.lineNumber,
        borderRight: `1px solid ${c.gutterBorder}`,
        paddingRight: '0',
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'transparent',
        color: c.lineNumberActive,
        fontWeight: '600',
      },
      '.cm-activeLine': {
        backgroundColor: c.lineHighlight,
      },
      '.cm-matchingBracket': {
        backgroundColor: c.selection,
        outline: `1px solid ${c.cursor}`,
        borderRadius: '2px',
      },
      '.cm-searchMatch': {
        backgroundColor: c.findMatchHighlight,
        borderRadius: '2px',
      },
      '.cm-searchMatch.cm-searchMatch-selected': {
        backgroundColor: c.findMatch,
        borderRadius: '2px',
      },
      '.cm-selectionBackground': {
        backgroundColor: c.selectionInactive,
      },
      '.cm-foldGutter span': {
        color: c.lineNumber,
        transition: 'opacity 0.2s ease, background-color 0.2s ease, transform 0.15s ease',
      },
      '.cm-foldGutter span:hover': {
        color: c.fg,
      },
      '.cm-foldPlaceholder': {
        backgroundColor: c.foldPlaceholder,
        color: c.lineNumber,
        border: 'none',
        padding: '0 6px',
        borderRadius: '3px',
        fontSize: '0.85em',
      },
      '.cm-indent-guides': {
        color: c.indentGuide,
      },
      '.cm-activeIndent-guides': {
        color: c.indentGuideActive,
      },
      '.cm-insertedLine': {
        backgroundColor: 'transparent',
      },
      '.cm-deletedLine': {
        backgroundColor: 'transparent',
      },
    },
    { dark: theme === 'dark' }
  );
}

function buildHighlightStyle(c: ThemeColors): Extension {
  return syntaxHighlighting(
    HighlightStyle.define([
      { tag: tags.comment, color: c.syntaxComment, fontStyle: 'italic' },
      { tag: tags.lineComment, color: c.syntaxComment, fontStyle: 'italic' },
      { tag: tags.blockComment, color: c.syntaxComment, fontStyle: 'italic' },
      { tag: tags.docComment, color: c.syntaxComment, fontStyle: 'italic' },
      { tag: tags.keyword, color: c.syntaxKeyword, fontWeight: '600' },
      { tag: tags.controlKeyword, color: c.syntaxKeyword, fontWeight: '600' },
      { tag: tags.operatorKeyword, color: c.syntaxKeyword, fontWeight: '600' },
      { tag: tags.definitionKeyword, color: c.syntaxKeyword, fontWeight: '700' },
      { tag: tags.moduleKeyword, color: c.syntaxKeyword, fontWeight: '600' },
      { tag: tags.string, color: c.syntaxString },
      { tag: tags.special(tags.string), color: c.syntaxString },
      { tag: tags.number, color: c.syntaxNumber },
      { tag: tags.integer, color: c.syntaxNumber },
      { tag: tags.float, color: c.syntaxNumber },
      { tag: tags.bool, color: c.syntaxKeyword },
      { tag: tags.null, color: c.syntaxKeyword },
      { tag: tags.regexp, color: c.syntaxRegexp },
      { tag: tags.escape, color: c.syntaxRegexp },
      { tag: tags.typeName, color: c.syntaxType },
      { tag: tags.definition(tags.typeName), color: c.syntaxType, fontWeight: '600' },
      { tag: tags.className, color: c.syntaxType },
      { tag: tags.labelName, color: c.syntaxProperty },
      { tag: tags.function(tags.variableName), color: c.syntaxFunction },
      {
        tag: tags.definition(tags.function(tags.variableName)),
        color: c.syntaxFunction,
        fontWeight: '600',
      },
      { tag: tags.variableName, color: c.fg },
      { tag: tags.definition(tags.variableName), color: c.syntaxVariable },
      { tag: tags.propertyName, color: c.syntaxProperty },
      { tag: tags.function(tags.propertyName), color: c.syntaxFunction },
      { tag: tags.operator, color: c.fg },
      { tag: tags.punctuation, color: c.fg, opacity: '0.7' },
      { tag: tags.bracket, color: c.fg, opacity: '0.7' },
      { tag: tags.angleBracket, color: c.fg, opacity: '0.7' },
      { tag: tags.separator, color: c.fg, opacity: '0.5' },
      { tag: tags.heading1, color: c.syntaxHeading, fontWeight: '700', fontSize: '1.3em' },
      { tag: tags.heading2, color: c.syntaxHeading, fontWeight: '700', fontSize: '1.15em' },
      { tag: tags.heading3, color: c.syntaxHeading, fontWeight: '600', fontSize: '1.05em' },
      { tag: tags.heading4, color: c.syntaxHeading, fontWeight: '600' },
      { tag: tags.heading5, color: c.syntaxHeading, fontWeight: '600' },
      { tag: tags.heading6, color: c.syntaxHeading, fontWeight: '600' },
      { tag: tags.strong, color: c.syntaxStrong, fontWeight: '700' },
      { tag: tags.emphasis, color: c.syntaxEmphasis, fontStyle: 'italic' },
      { tag: tags.link, color: c.syntaxLink, textDecoration: 'underline' },
      { tag: tags.url, color: c.syntaxLink },
      { tag: tags.monospace, color: c.syntaxString, fontFamily: 'var(--font-mono, monospace)' },
      { tag: tags.quote, color: c.syntaxComment, fontStyle: 'italic' },
      { tag: tags.meta, color: c.syntaxComment },
      { tag: tags.processingInstruction, color: c.syntaxComment },
      { tag: tags.strikethrough, textDecoration: 'line-through' },
      { tag: tags.inserted, color: c.syntaxString },
      { tag: tags.deleted, color: c.syntaxRegexp },
      { tag: tags.changed, color: c.syntaxNumber },
    ])
  );
}

const diffBaseTheme: Extension = EditorView.baseTheme({
  '.cm-deletedLine .cm-gutterElement': {
    color: 'var(--danger, #f87171)',
    backgroundColor: 'var(--editor-diff-remove-bg)',
    opacity: '0.85',
  },
  '.cm-insertedLine .cm-gutterElement': {
    color: 'var(--success, #4ade80)',
    backgroundColor: 'var(--editor-diff-insert-bg)',
    opacity: '0.85',
  },
  '.cm-collapsedLines': {
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '0',
    padding: '2px 0',
    color: 'var(--text-muted)',
    fontSize: '0.8em',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  },
  '.cm-collapsedLines::before': {
    content: "''",
    flex: '1',
    borderTop: '1px dashed var(--border-subtle, rgba(255,255,255,0.12))',
    margin: '0',
  },
  '.cm-collapsedLines::after': {
    content: "''",
    flex: '1',
    borderTop: '1px dashed var(--border-subtle, rgba(255,255,255,0.12))',
    margin: '0',
  },
  '.cm-collapsedLines:hover': {
    color: 'var(--text-primary)',
  },
  '.cm-merge-change-chunk': {
    borderLeft: 'none',
  },
  '.cm-merge-revert, .cm-merge-accept, .cm-merge-reject': {
    color: 'var(--text-muted)',
    opacity: '0.72',
  },
  '.cm-merge-revert:hover, .cm-merge-accept:hover, .cm-merge-reject:hover': {
    color: 'var(--text-primary)',
    opacity: '1',
  },
});

let adlLightTheme: Extension[];
let adlDarkTheme: Extension[];

function buildThemeExtensions(theme: 'light' | 'dark'): Extension[] {
  const colors = readColors(theme);
  const editorTheme = buildEditorTheme(colors, theme);
  const highlightStyle = buildHighlightStyle(colors);
  return [diffBaseTheme, editorTheme, highlightStyle];
}

function ensureThemes(): void {
  if (!adlLightTheme) {
    adlLightTheme = buildThemeExtensions('light');
  }
  if (!adlDarkTheme) {
    adlDarkTheme = buildThemeExtensions('dark');
  }
}

export { adlLightTheme, adlDarkTheme };

export function getThemeExtension(theme: 'light' | 'dark'): Extension {
  ensureThemes();
  return theme === 'dark' ? adlDarkTheme : adlLightTheme;
}

export function rebuildThemes(): void {
  adlLightTheme = buildThemeExtensions('light');
  adlDarkTheme = buildThemeExtensions('dark');
}

export function getPhrasesExtension(locale: string): Extension {
  if (locale === 'zh-CN') {
    return EditorState.phrases.of({
      '$ unchanged lines': '$ 行无变化',
      'Revert this chunk': '还原此块',
      Accept: '接受',
      Reject: '拒绝',
    });
  }
  return [];
}
