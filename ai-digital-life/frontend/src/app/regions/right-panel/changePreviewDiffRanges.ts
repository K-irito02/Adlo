export type PreviewDiffRange = {
  startLine: number;
  endLine: number;
  type: "insert" | "delete";
};

export type PreviewDiffVisualTone = "base" | "strong" | "block";

export type PreviewDiffVisualRange = PreviewDiffRange & {
  tone: PreviewDiffVisualTone;
  contentColumns: number;
};

export type PreviewDiffMinimapModel = {
  ranges: PreviewDiffVisualRange[];
  totalLines: number;
  lineColumns: number[];
};

export type PreviewDiffMinimapOptions = {
  wrapColumn?: number | null;
  hiddenUnchangedRanges?: PreviewDiffCollapsedRange[];
};

export type PreviewDiffCollapsedRange = {
  startLine: number;
  endLine: number;
};

const MAX_EXACT_DIFF_CELLS = 2_000_000;
const BLOCK_TONE_LINE_THRESHOLD = 8;

type InternalDiffRange = PreviewDiffRange & {
  blockId: number;
  contentColumns: number;
  hasOppositeInBlock: boolean;
};

function splitLines(content: string): string[] {
  if (!content) return [];
  return content.split(/\r\n|\r|\n/);
}

function appendRange(ranges: PreviewDiffRange[], next: PreviewDiffRange) {
  const previous = ranges[ranges.length - 1];
  if (previous && previous.type === next.type && previous.endLine + 1 >= next.startLine) {
    previous.endLine = Math.max(previous.endLine, next.endLine);
    return;
  }
  ranges.push(next);
}

function getMaxColumns(lines: string[], startLine: number, endLine: number): number {
  const startIndex = Math.max(0, startLine - 1);
  const endIndex = Math.min(lines.length - 1, endLine - 1);
  if (endIndex < startIndex) return 0;

  let maxColumns = 0;
  for (let index = startIndex; index <= endIndex; index += 1) {
    maxColumns = Math.max(maxColumns, lines[index]?.length ?? 0);
  }
  return maxColumns;
}

function appendInternalRange(ranges: InternalDiffRange[], next: InternalDiffRange) {
  const previous = ranges[ranges.length - 1];
  if (
    previous &&
    previous.type === next.type &&
    previous.blockId === next.blockId &&
    previous.hasOppositeInBlock === next.hasOppositeInBlock &&
    previous.endLine + 1 >= next.startLine
  ) {
    previous.endLine = Math.max(previous.endLine, next.endLine);
    previous.contentColumns = Math.max(previous.contentColumns, next.contentColumns);
    return;
  }
  ranges.push(next);
}

function appendVisualRange(ranges: PreviewDiffVisualRange[], next: PreviewDiffVisualRange) {
  const previous = ranges[ranges.length - 1];
  if (
    previous &&
    previous.type === next.type &&
    previous.tone === next.tone &&
    previous.contentColumns === next.contentColumns &&
    previous.endLine + 1 >= next.startLine
  ) {
    previous.endLine = Math.max(previous.endLine, next.endLine);
    return;
  }
  ranges.push(next);
}

function getVisualColumns(line: string, wrapColumn?: number | null): number[] {
  if (!wrapColumn || wrapColumn <= 0) {
    return [line.length];
  }

  const columns: number[] = [];
  const normalizedWrapColumn = Math.max(1, Math.floor(wrapColumn));
  let remaining = line.length;
  if (remaining === 0) {
    return [0];
  }

  while (remaining > normalizedWrapColumn) {
    columns.push(normalizedWrapColumn);
    remaining -= normalizedWrapColumn;
  }
  columns.push(remaining);
  return columns;
}

function getVisualLineCount(line: string, wrapColumn?: number | null): number {
  return getVisualColumns(line, wrapColumn).length;
}

function createInternalRange(input: {
  startLine: number;
  endLine: number;
  type: "insert" | "delete";
  blockId: number;
  contentLines: string[];
  sourceStartLine: number;
  sourceEndLine: number;
  hasOppositeInBlock: boolean;
}): InternalDiffRange {
  return {
    startLine: input.startLine,
    endLine: input.endLine,
    type: input.type,
    blockId: input.blockId,
    hasOppositeInBlock: input.hasOppositeInBlock,
    contentColumns: getMaxColumns(input.contentLines, input.sourceStartLine, input.sourceEndLine)
  };
}

function computeFallbackRanges(baseLines: string[], currentLines: string[]): InternalDiffRange[] {
  const prefix = getCommonPrefixLength(baseLines, currentLines);
  const suffix = getCommonSuffixLength(baseLines, currentLines, prefix);

  const ranges: InternalDiffRange[] = [];
  const insertedLines = currentLines.length - prefix - suffix;
  const deletedLines = baseLines.length - prefix - suffix;
  const anchorLine = Math.max(1, prefix + 1);
  const hasOppositeInBlock = insertedLines > 0 && deletedLines > 0;

  if (deletedLines > 0) {
    appendInternalRange(ranges, createInternalRange({
      startLine: anchorLine,
      endLine: anchorLine,
      type: "delete",
      blockId: 1,
      contentLines: baseLines,
      sourceStartLine: prefix + 1,
      sourceEndLine: baseLines.length - suffix,
      hasOppositeInBlock
    }));
  }
  if (insertedLines > 0) {
    appendInternalRange(ranges, createInternalRange({
      startLine: anchorLine,
      endLine: Math.max(anchorLine, prefix + insertedLines),
      type: "insert",
      blockId: 1,
      contentLines: currentLines,
      sourceStartLine: prefix + 1,
      sourceEndLine: currentLines.length - suffix,
      hasOppositeInBlock
    }));
  }

  return ranges;
}

function getCommonPrefixLength(baseLines: string[], currentLines: string[]): number {
  let prefix = 0;
  while (
    prefix < baseLines.length &&
    prefix < currentLines.length &&
    baseLines[prefix] === currentLines[prefix]
  ) {
    prefix += 1;
  }
  return prefix;
}

function getCommonSuffixLength(baseLines: string[], currentLines: string[], prefix: number): number {
  let suffix = 0;
  while (
    suffix + prefix < baseLines.length &&
    suffix + prefix < currentLines.length &&
    baseLines[baseLines.length - suffix - 1] === currentLines[currentLines.length - suffix - 1]
  ) {
    suffix += 1;
  }
  return suffix;
}

function getVisualLineTotal(lines: string[], wrapColumn?: number | null): number {
  return lines.reduce((total, line) => total + getVisualLineCount(line, wrapColumn), 0);
}

function computeInternalDiffRanges(baseContent: string, currentContent: string): InternalDiffRange[] {
  const baseLines = splitLines(baseContent);
  const currentLines = splitLines(currentContent);

  if (baseLines.length === 0 && currentLines.length === 0) return [];
  if (baseLines.length === 0) {
    return [createInternalRange({
      startLine: 1,
      endLine: Math.max(1, currentLines.length),
      type: "insert",
      blockId: 1,
      contentLines: currentLines,
      sourceStartLine: 1,
      sourceEndLine: currentLines.length,
      hasOppositeInBlock: false
    })];
  }
  if (currentLines.length === 0) {
    return [createInternalRange({
      startLine: 1,
      endLine: 1,
      type: "delete",
      blockId: 1,
      contentLines: baseLines,
      sourceStartLine: 1,
      sourceEndLine: baseLines.length,
      hasOppositeInBlock: false
    })];
  }

  if (baseLines.length * currentLines.length > MAX_EXACT_DIFF_CELLS) {
    return computeFallbackRanges(baseLines, currentLines);
  }

  const rows = baseLines.length + 1;
  const columns = currentLines.length + 1;
  const dp = Array.from({ length: rows }, () => new Uint16Array(columns));

  for (let i = baseLines.length - 1; i >= 0; i -= 1) {
    for (let j = currentLines.length - 1; j >= 0; j -= 1) {
      dp[i][j] = baseLines[i] === currentLines[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ranges: InternalDiffRange[] = [];
  let i = 0;
  let j = 0;
  let blockId = 0;

  while (i < baseLines.length || j < currentLines.length) {
    if (i < baseLines.length && j < currentLines.length && baseLines[i] === currentLines[j]) {
      i += 1;
      j += 1;
      continue;
    }

    const anchorLine = Math.max(1, j + 1);
    blockId += 1;
    let insertStartLine = 0;
    let insertEndLine = 0;
    let deleteStartLine = 0;
    let deleteEndLine = 0;

    while (
      i < baseLines.length || j < currentLines.length
    ) {
      if (i < baseLines.length && j < currentLines.length && baseLines[i] === currentLines[j]) {
        break;
      }

      if (j < currentLines.length && (i === baseLines.length || dp[i][j + 1] >= dp[i + 1][j])) {
        if (insertStartLine === 0) {
          insertStartLine = j + 1;
        }
        j += 1;
        insertEndLine = j;
      } else {
        if (deleteStartLine === 0) {
          deleteStartLine = i + 1;
        }
        i += 1;
        deleteEndLine = i;
      }
    }

    const hasInsert = insertStartLine > 0;
    const hasDelete = deleteStartLine > 0;
    const hasOppositeInBlock = hasInsert && hasDelete;

    if (insertStartLine > 0) {
      appendInternalRange(ranges, createInternalRange({
        startLine: insertStartLine,
        endLine: insertEndLine,
        type: "insert",
        blockId,
        contentLines: currentLines,
        sourceStartLine: insertStartLine,
        sourceEndLine: insertEndLine,
        hasOppositeInBlock
      }));
    }
    if (hasDelete) {
      appendInternalRange(ranges, createInternalRange({
        startLine: anchorLine,
        endLine: anchorLine,
        type: "delete",
        blockId,
        contentLines: baseLines,
        sourceStartLine: deleteStartLine,
        sourceEndLine: deleteEndLine,
        hasOppositeInBlock
      }));
    }
  }

  return ranges;
}

function toPreviewDiffRange(range: InternalDiffRange): PreviewDiffRange {
  return {
    startLine: range.startLine,
    endLine: range.endLine,
    type: range.type
  };
}

function getVisualTone(range: InternalDiffRange): PreviewDiffVisualTone {
  const lineCount = Math.max(1, range.endLine - range.startLine + 1);
  if (range.hasOppositeInBlock) return "strong";
  if (lineCount >= BLOCK_TONE_LINE_THRESHOLD) return "block";
  return "base";
}

export function computePreviewDiffRanges(baseContent: string, currentContent: string): PreviewDiffRange[] {
  const ranges: PreviewDiffRange[] = [];
  computeInternalDiffRanges(baseContent, currentContent).forEach((range) => appendRange(ranges, toPreviewDiffRange(range)));
  return ranges;
}

export function computePreviewDiffVisualRanges(baseContent: string, currentContent: string): PreviewDiffVisualRange[] {
  return computeInternalDiffRanges(baseContent, currentContent).map((range) => ({
    startLine: range.startLine,
    endLine: range.endLine,
    type: range.type,
    tone: getVisualTone(range),
    contentColumns: range.contentColumns
  }));
}

function appendVisualLineRanges(input: {
  ranges: PreviewDiffVisualRange[];
  lineColumns?: number[];
  visualLine: number;
  lines: string[];
  type: "insert" | "delete";
  tone: PreviewDiffVisualTone;
  wrapColumn?: number | null;
}): number {
  let visualLine = input.visualLine;
  input.lines.forEach((line) => {
    getVisualColumns(line, input.wrapColumn).forEach((contentColumns) => {
      input.lineColumns?.push(contentColumns);
      appendVisualRange(input.ranges, {
        startLine: visualLine,
        endLine: visualLine,
        type: input.type,
        tone: input.tone,
        contentColumns
      });
      visualLine += 1;
    });
  });
  return visualLine;
}

function appendVisualLineColumns(lineColumns: number[], lines: string[], wrapColumn?: number | null): number {
  let visualLineCount = 0;
  lines.forEach((line) => {
    const columns = getVisualColumns(line, wrapColumn);
    lineColumns.push(...columns);
    visualLineCount += columns.length;
  });
  return visualLineCount;
}

function isLineHidden(lineNumber: number, hiddenUnchangedRanges: PreviewDiffCollapsedRange[]): boolean {
  return hiddenUnchangedRanges.some((range) => lineNumber >= range.startLine && lineNumber <= range.endLine);
}

function computeFallbackMinimapModel(
  baseLines: string[],
  currentLines: string[],
  wrapColumn?: number | null
): PreviewDiffMinimapModel {
  const prefix = getCommonPrefixLength(baseLines, currentLines);
  const suffix = getCommonSuffixLength(baseLines, currentLines, prefix);
  const inserted = currentLines.slice(prefix, currentLines.length - suffix);
  const deleted = baseLines.slice(prefix, baseLines.length - suffix);
  const suffixLines = currentLines.slice(currentLines.length - suffix);
  const ranges: PreviewDiffVisualRange[] = [];
  const lineColumns: number[] = [];
  const hasOppositeInBlock = inserted.length > 0 && deleted.length > 0;
  const changedLineCount = inserted.length + deleted.length;
  const tone: PreviewDiffVisualTone = hasOppositeInBlock
    ? "strong"
    : changedLineCount >= BLOCK_TONE_LINE_THRESHOLD
      ? "block"
      : "base";
  let visualLine = appendVisualLineColumns(lineColumns, currentLines.slice(0, prefix), wrapColumn) + 1;

  visualLine = appendVisualLineRanges({
    ranges,
    lineColumns,
    visualLine,
    lines: inserted,
    type: "insert",
    tone,
    wrapColumn
  });
  visualLine = appendVisualLineRanges({
    ranges,
    lineColumns,
    visualLine,
    lines: deleted,
    type: "delete",
    tone,
    wrapColumn
  });

  return {
    totalLines: Math.max(1, visualLine - 1 + appendVisualLineColumns(lineColumns, suffixLines, wrapColumn)),
    ranges,
    lineColumns
  };
}

export function computePreviewDiffMinimapModel(
  baseContent: string,
  currentContent: string,
  options?: PreviewDiffMinimapOptions
): PreviewDiffMinimapModel {
  const baseLines = splitLines(baseContent);
  const currentLines = splitLines(currentContent);
  const wrapColumn = options?.wrapColumn ?? null;
  const hiddenUnchangedRanges = options?.hiddenUnchangedRanges ?? [];

  if (baseLines.length === 0 && currentLines.length === 0) {
    return { totalLines: 0, ranges: [], lineColumns: [] };
  }

  if (baseLines.length === 0) {
    const ranges: PreviewDiffVisualRange[] = [];
    const lineColumns: number[] = [];
    const visualLine = appendVisualLineRanges({
      ranges,
      lineColumns,
      visualLine: 1,
      lines: currentLines,
      type: "insert",
      tone: currentLines.length >= BLOCK_TONE_LINE_THRESHOLD ? "block" : "base",
      wrapColumn
    });
    return {
      totalLines: Math.max(1, visualLine - 1),
      ranges,
      lineColumns
    };
  }

  if (currentLines.length === 0) {
    const ranges: PreviewDiffVisualRange[] = [];
    const lineColumns: number[] = [];
    const visualLine = appendVisualLineRanges({
      ranges,
      lineColumns,
      visualLine: 1,
      lines: baseLines,
      type: "delete",
      tone: baseLines.length >= BLOCK_TONE_LINE_THRESHOLD ? "block" : "base",
      wrapColumn
    });
    return {
      totalLines: Math.max(1, visualLine - 1),
      ranges,
      lineColumns
    };
  }

  if (baseLines.length * currentLines.length > MAX_EXACT_DIFF_CELLS) {
    return computeFallbackMinimapModel(baseLines, currentLines, wrapColumn);
  }

  const rows = baseLines.length + 1;
  const columns = currentLines.length + 1;
  const dp = Array.from({ length: rows }, () => new Uint16Array(columns));

  for (let i = baseLines.length - 1; i >= 0; i -= 1) {
    for (let j = currentLines.length - 1; j >= 0; j -= 1) {
      dp[i][j] = baseLines[i] === currentLines[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ranges: PreviewDiffVisualRange[] = [];
  const lineColumns: number[] = [];
  let i = 0;
  let j = 0;
  let visualLine = 1;

  while (i < baseLines.length || j < currentLines.length) {
    if (i < baseLines.length && j < currentLines.length && baseLines[i] === currentLines[j]) {
      const currentLineNumber = j + 1;
      if (!isLineHidden(currentLineNumber, hiddenUnchangedRanges)) {
        const columns = getVisualColumns(currentLines[j], wrapColumn);
        lineColumns.push(...columns);
        visualLine += columns.length;
      }
      i += 1;
      j += 1;
      continue;
    }

    const inserted: string[] = [];
    const deleted: string[] = [];

    while (i < baseLines.length || j < currentLines.length) {
      if (i < baseLines.length && j < currentLines.length && baseLines[i] === currentLines[j]) {
        break;
      }

      if (j < currentLines.length && (i === baseLines.length || dp[i][j + 1] >= dp[i + 1][j])) {
        inserted.push(currentLines[j] ?? "");
        j += 1;
      } else {
        deleted.push(baseLines[i] ?? "");
        i += 1;
      }
    }

    const hasOppositeInBlock = inserted.length > 0 && deleted.length > 0;
    const changedLineCount = inserted.length + deleted.length;
    const tone: PreviewDiffVisualTone = hasOppositeInBlock
      ? "strong"
      : changedLineCount >= BLOCK_TONE_LINE_THRESHOLD
        ? "block"
        : "base";

    visualLine = appendVisualLineRanges({
      ranges,
      lineColumns,
      visualLine,
      lines: inserted,
      type: "insert",
      tone,
      wrapColumn
    });

    visualLine = appendVisualLineRanges({
      ranges,
      lineColumns,
      visualLine,
      lines: deleted,
      type: "delete",
      tone,
      wrapColumn
    });
  }

  return {
    totalLines: Math.max(0, visualLine - 1),
    ranges,
    lineColumns
  };
}
