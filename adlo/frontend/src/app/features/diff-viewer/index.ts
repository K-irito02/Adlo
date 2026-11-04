export { DiffViewer, type DiffViewerProps } from './DiffViewer';
export {
  computeSyncedScrollTop,
  syncHorizontalScroll,
  buildCollapsedUnchangedRanges,
} from './diffViewerUtils';
export type { ScrollSyncMetrics } from './sharedExtensions';

export type {
  PreviewDiffRange,
  PreviewDiffVisualTone,
  PreviewDiffVisualRange,
  PreviewDiffCollapsedRange,
} from './changePreviewDiffRanges';

export {
  computePreviewDiffRanges,
  computePreviewDiffVisualRanges,
} from './changePreviewDiffRanges';
