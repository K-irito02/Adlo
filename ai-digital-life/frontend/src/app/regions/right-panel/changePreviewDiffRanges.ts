export type PreviewDiffRange = {
  startLine: number;
  endLine: number;
  type: "insert" | "delete";
};

const MAX_EXACT_DIFF_CELLS = 2_000_000;

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

function computeFallbackRange(baseLines: string[], currentLines: string[]): PreviewDiffRange[] {
  let prefix = 0;
  while (
    prefix < baseLines.length &&
    prefix < currentLines.length &&
    baseLines[prefix] === currentLines[prefix]
  ) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix + prefix < baseLines.length &&
    suffix + prefix < currentLines.length &&
    baseLines[baseLines.length - suffix - 1] === currentLines[currentLines.length - suffix - 1]
  ) {
    suffix += 1;
  }

  const ranges: PreviewDiffRange[] = [];
  const insertedLines = currentLines.length - prefix - suffix;
  const deletedLines = baseLines.length - prefix - suffix;
  const anchorLine = Math.max(1, prefix + 1);

  if (deletedLines > 0) {
    appendRange(ranges, { startLine: anchorLine, endLine: anchorLine, type: "delete" });
  }
  if (insertedLines > 0) {
    appendRange(ranges, {
      startLine: anchorLine,
      endLine: Math.max(anchorLine, prefix + insertedLines),
      type: "insert"
    });
  }

  return ranges;
}

export function computePreviewDiffRanges(baseContent: string, currentContent: string): PreviewDiffRange[] {
  const baseLines = splitLines(baseContent);
  const currentLines = splitLines(currentContent);

  if (baseLines.length === 0 && currentLines.length === 0) return [];
  if (baseLines.length === 0) {
    return [{ startLine: 1, endLine: Math.max(1, currentLines.length), type: "insert" }];
  }
  if (currentLines.length === 0) {
    return [{ startLine: 1, endLine: 1, type: "delete" }];
  }

  if (baseLines.length * currentLines.length > MAX_EXACT_DIFF_CELLS) {
    return computeFallbackRange(baseLines, currentLines);
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

  const ranges: PreviewDiffRange[] = [];
  let i = 0;
  let j = 0;

  while (i < baseLines.length || j < currentLines.length) {
    if (i < baseLines.length && j < currentLines.length && baseLines[i] === currentLines[j]) {
      i += 1;
      j += 1;
      continue;
    }

    const anchorLine = Math.max(1, j + 1);
    let insertStartLine = 0;
    let insertEndLine = 0;
    let hasDelete = false;

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
        i += 1;
        hasDelete = true;
      }
    }

    if (insertStartLine > 0) {
      appendRange(ranges, { startLine: insertStartLine, endLine: insertEndLine, type: "insert" });
    }
    if (hasDelete) {
      appendRange(ranges, { startLine: anchorLine, endLine: anchorLine, type: "delete" });
    }
  }

  return ranges;
}
