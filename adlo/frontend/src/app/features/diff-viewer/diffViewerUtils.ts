import { getChunks } from '@codemirror/merge';
import type { EditorState } from '@codemirror/state';
import { initScrollbarWidth } from './scrollbarWidth';
import type { PreviewDiffCollapsedRange } from './changePreviewDiffRanges';
import type { MergeChunk } from './sharedExtensions';

initScrollbarWidth();

export function getMergeChunks(state: EditorState): readonly MergeChunk[] {
  return getChunks(state)?.chunks ?? [];
}

function expandedLinesHasOverlap(
  expandedLines: ReadonlySet<number>,
  startLine: number,
  endLine: number,
): boolean {
  if (expandedLines.size === 0) {
    return false;
  }
  // 展开行通常远少于区间行数：直接迭代展开集合，命中即返回。
  for (const line of expandedLines) {
    if (line >= startLine && line <= endLine) {
      return true;
    }
  }
  return false;
}

export function buildCollapsedUnchangedRanges(input: {
  chunks: readonly MergeChunk[];
  doc: EditorState['doc'];
  margin?: number;
  minSize?: number;
  expandedLines?: ReadonlySet<number>;
}): PreviewDiffCollapsedRange[] {
  const margin = input.margin ?? 3;
  const minSize = input.minSize ?? 4;
  const expandedLines = input.expandedLines ?? new Set<number>();
  const ranges: PreviewDiffCollapsedRange[] = [];
  let prevLine = 1;

  for (let index = 0; ; index += 1) {
    const chunk = index < input.chunks.length ? input.chunks[index] : null;
    const collapseFrom = index > 0 ? prevLine + margin : 1;
    const collapseTo = chunk
      ? Math.max(input.doc.lineAt(chunk.fromB).number - 1 - margin, collapseFrom)
      : input.doc.lines;
    const lineCount = collapseTo - collapseFrom + 1;
    if (
      lineCount >= minSize &&
      // 区间存在性判定：避免 `[...expandedLines]` 在循环内反复展开（区块多时是热点）。
      !expandedLinesHasOverlap(expandedLines, collapseFrom, collapseTo)
    ) {
      ranges.push({ startLine: collapseFrom, endLine: collapseTo });
    }
    if (!chunk) {
      break;
    }
    prevLine = input.doc.lineAt(Math.min(input.doc.length, chunk.toB)).number;
  }

  return ranges;
}
