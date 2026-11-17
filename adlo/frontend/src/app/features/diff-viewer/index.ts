export { DiffViewer, type DiffViewerProps } from './DiffViewer';
export { buildCollapsedUnchangedRanges } from './diffViewerUtils';

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
