import { getChunks } from "@codemirror/merge";
import type { EditorState } from "@codemirror/state";
import { initScrollbarWidth } from "./scrollbarWidth";
import type { PreviewDiffCollapsedRange } from "./changePreviewDiffRanges";
import type { ScrollSyncMetrics, MergeChunk } from "./sharedExtensions";

initScrollbarWidth();

export function getMergeChunks(state: EditorState): readonly MergeChunk[] {
  return getChunks(state)?.chunks ?? [];
}

export function computeSyncedScrollTop(input: ScrollSyncMetrics): number {
  const sourceMax = Math.max(0, input.sourceScrollHeight - input.sourceClientHeight);
  if (sourceMax <= 0) return 0;
  const targetMax = Math.max(0, input.targetScrollHeight - input.targetClientHeight);
  const ratio = Math.max(0, Math.min(input.sourceScrollTop, sourceMax)) / sourceMax;
  return ratio * targetMax;
}

export function syncHorizontalScroll(source: HTMLElement, target: HTMLElement): void {
  const sourceMax = Math.max(0, source.scrollWidth - source.clientWidth);
  if (sourceMax <= 0) {
    target.scrollLeft = 0;
    return;
  }
  const targetMax = Math.max(0, target.scrollWidth - target.clientWidth);
  if (targetMax <= 0) return;
  const ratio = Math.max(0, Math.min(source.scrollLeft, sourceMax)) / sourceMax;
  target.scrollLeft = ratio * targetMax;
}

export function buildCollapsedUnchangedRanges(input: {
  chunks: readonly MergeChunk[];
  doc: EditorState["doc"];
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
      ? input.doc.lineAt(chunk.fromB).number - 1 - margin
      : input.doc.lines;
    const lineCount = collapseTo - collapseFrom + 1;
    if (
      lineCount >= minSize &&
      ![...expandedLines].some((line) => line >= collapseFrom && line <= collapseTo)
    ) {
      ranges.push({ startLine: collapseFrom, endLine: collapseTo });
    }
    if (!chunk) break;
    prevLine = input.doc.lineAt(Math.min(input.doc.length, chunk.toB)).number;
  }

  return ranges;
}

export function syncScrollPosition(source: HTMLElement, target: HTMLElement) {
  const nextScrollTop = computeSyncedScrollTop({
    sourceScrollTop: source.scrollTop,
    sourceScrollHeight: source.scrollHeight,
    sourceClientHeight: source.clientHeight,
    targetScrollHeight: target.scrollHeight,
    targetClientHeight: target.clientHeight,
  });
  if (Math.abs(target.scrollTop - nextScrollTop) > 0.5) {
    target.scrollTop = nextScrollTop;
  }
}
