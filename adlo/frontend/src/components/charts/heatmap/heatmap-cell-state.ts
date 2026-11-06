import type { HeatmapLevelResolver } from './heatmap-data';

export interface HeatmapCellHoverState {
  isHighlighted: boolean;
  isDimmed: boolean;
}

/** Resolves cell dimming for cell-hover and legend-level-hover interactions. */
export function computeHeatmapCellFaded(
  isCellHovering: boolean,
  isLevelHovering: boolean,
  hoveredCell: { column: number; row: number } | null,
  hoveredLegendLevel: number | null,
  cell: { column: number; row: number },
  count: number,
  levelForCount: HeatmapLevelResolver,
): HeatmapCellHoverState {
  if (isCellHovering && hoveredCell) {
    const isHighlighted = hoveredCell.column === cell.column && hoveredCell.row === cell.row;
    return { isHighlighted, isDimmed: !isHighlighted };
  }
  if (isLevelHovering && hoveredLegendLevel !== null) {
    const isHighlighted = levelForCount(count) === hoveredLegendLevel;
    return { isHighlighted, isDimmed: !isHighlighted };
  }
  return { isHighlighted: false, isDimmed: false };
}
