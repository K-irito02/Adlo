import type { FileOutlineItem } from "@ai-digital-life/kernel";
import type { EditorRef, Disposable } from "../../types";
import type { PreviewDiffVisualRange } from "./changePreviewDiffRanges";

const MAX_STICKY_CONTEXT_ROWS = 3;
const DEFAULT_TOP_LABEL = "File top";
const TOP_ENTRY_ID = "sticky-top";

export type StickyContextEntryKind = FileOutlineItem["kind"] | "line" | "top";
export type StickyContextEntryTone = "top" | "context" | "insert" | "delete" | "modified";

export interface StickyContextEntry {
  id: string;
  label: string;
  detail?: string;
  line: number;
  kind: StickyContextEntryKind;
  tone: StickyContextEntryTone;
  depth?: number;
}

export interface StickyContextModel {
  modelId: string;
  topEntry: StickyContextEntry;
  canScrollToTop: boolean;
  showTopEntry: boolean;
  scrollToTop: () => void;
}

export interface StickyContextProvider {
  getModel: () => StickyContextModel | null;
}

type BuildStickyContextEntriesInput = {
  content: string;
  outline: FileOutlineItem[];
  visibleStartLine: number;
  maxContextRows?: number;
  diffRanges?: PreviewDiffVisualRange[];
};

type CreateStickyContextModelInput = {
  canScrollToTop: boolean;
  onNavigateLine: (line: number) => void;
  topLabel?: string;
};

function clampContextRows(value: number | undefined): number {
  const normalized = Number.isFinite(value) ? Math.floor(value ?? MAX_STICKY_CONTEXT_ROWS) : MAX_STICKY_CONTEXT_ROWS;
  return Math.max(0, Math.min(MAX_STICKY_CONTEXT_ROWS, normalized));
}

function splitLines(content: string): string[] {
  return content ? content.split(/\r\n|\r|\n/) : [];
}

function trimStickyLabel(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 72) {
    return trimmed;
  }
  return `${trimmed.slice(0, 69).trimEnd()}...`;
}

function resolveHeadingDepth(lineText: string | undefined): number | undefined {
  const match = lineText?.match(/^(#+)\s+/);
  return match ? match[1].length : undefined;
}

function resolveStickyTone(line: number, diffRanges: PreviewDiffVisualRange[] | undefined): StickyContextEntryTone {
  if (!diffRanges?.length) {
    return "context";
  }

  let hasInsert = false;
  let hasDelete = false;
  for (const range of diffRanges) {
    if (line < range.startLine || line > range.endLine) {
      continue;
    }
    if (range.type === "insert") {
      hasInsert = true;
    } else if (range.type === "delete") {
      hasDelete = true;
    }
  }

  if (hasInsert && hasDelete) {
    return "modified";
  }
  if (hasInsert) {
    return "insert";
  }
  if (hasDelete) {
    return "delete";
  }
  return "context";
}

function buildOutlineEntries(input: BuildStickyContextEntriesInput, lines: string[], maxContextRows: number): StickyContextEntry[] {
  if (input.visibleStartLine <= 1 || input.outline.length === 0 || maxContextRows === 0) {
    return [];
  }

  const entries = input.outline
    .filter((item) => item.line < input.visibleStartLine)
    .map<StickyContextEntry>((item) => ({
      id: `sticky-outline-${item.line}-${item.kind}-${item.label}`,
      label: trimStickyLabel(item.label),
      detail: `L${item.line}`,
      line: item.line,
      kind: item.kind,
      tone: resolveStickyTone(item.line, input.diffRanges),
      depth: item.kind === "heading" ? resolveHeadingDepth(lines[item.line - 1]) : undefined
    }));

  return entries.slice(-maxContextRows);
}

function buildFallbackLineEntries(input: BuildStickyContextEntriesInput, lines: string[], maxContextRows: number): StickyContextEntry[] {
  if (input.visibleStartLine <= 1 || maxContextRows === 0) {
    return [];
  }

  const entries: StickyContextEntry[] = [];
  for (let line = Math.min(lines.length, input.visibleStartLine - 1); line >= 1; line -= 1) {
    const text = trimStickyLabel(lines[line - 1] ?? "");
    if (!text) {
      continue;
    }
    entries.unshift({
      id: `sticky-line-${line}`,
      label: text,
      detail: `L${line}`,
      line,
      kind: "line",
      tone: resolveStickyTone(line, input.diffRanges)
    });
    if (entries.length >= maxContextRows) {
      break;
    }
  }

  return entries;
}

export function buildStickyContextEntries(input: BuildStickyContextEntriesInput): StickyContextEntry[] {
  const lines = splitLines(input.content);
  const maxContextRows = clampContextRows(input.maxContextRows);
  const outlineEntries = buildOutlineEntries(input, lines, maxContextRows);
  if (outlineEntries.length > 0) {
    return outlineEntries;
  }
  return buildFallbackLineEntries(input, lines, maxContextRows);
}

export function createStickyContextModel(input: CreateStickyContextModelInput): StickyContextModel {
  const topEntry: StickyContextEntry = {
    id: TOP_ENTRY_ID,
    label: input.topLabel?.trim() || DEFAULT_TOP_LABEL,
    detail: "L1",
    line: 1,
    kind: "top",
    tone: "top"
  };

  return {
    modelId: `${Date.now()}-${Math.random()}`,
    topEntry,
    canScrollToTop: input.canScrollToTop,
    showTopEntry: input.canScrollToTop,
    scrollToTop: () => input.onNavigateLine(1)
  };
}

export function getVisibleStartLine(editor: EditorRef | null): number {
  const firstVisibleRange = editor?.getVisibleRanges()?.[0];
  return firstVisibleRange?.startLineNumber ?? 1;
}

export function navigateToLine(editor: EditorRef | null, line: number): void {
  if (!editor) {
    return;
  }
  editor.revealLineInCenter(line);
  editor.setPosition({ lineNumber: line, column: 1 });
  editor.focus();
}

export function subscribeToEditor(
  editor: EditorRef | null,
  callback: () => void
): Disposable {
  if (!editor) {
    return { dispose() {} };
  }
  return editor.onDidScrollChange(callback);
}
