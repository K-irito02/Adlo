export function getHeatmapContributionLevel(count: number): number {
  if (count <= 0) {
    return 0;
  }
  if (count === 1) {
    return 1;
  }
  if (count === 2) {
    return 2;
  }
  if (count === 3) {
    return 3;
  }
  return 4;
}

export function formatHeatmapTooltipDate(date: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale ?? undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

export function formatHeatmapTooltipWeekday(date: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale ?? undefined, {
    weekday: 'long',
  }).format(date);
}

export function formatHeatmapContributionLabel(count: number, _date?: Date): string {
  const word = count === 1 ? 'contribution' : 'contributions';
  return `${count} ${word}`;
}

export type HeatmapYAxisTickFilter = 'all' | 'odd' | 'even';

export type HeatmapYAxisLabelFormat = 'full' | 'initial';

export function formatHeatmapYAxisLabel(
  label: string,
  labelFormat: HeatmapYAxisLabelFormat
): string {
  return labelFormat === 'initial' ? label.charAt(0) : label;
}

export function shouldShowHeatmapYAxisTick(
  row: number,
  tickFilter: HeatmapYAxisTickFilter
): boolean {
  switch (tickFilter) {
    case 'all':
      return true;
    case 'odd':
      return row % 2 === 1;
    case 'even':
      return row % 2 === 0;
    default:
      return row % 2 === 1;
  }
}

export interface HeatmapHoverStyleParams {
  inactiveOpacity: number;
  inactiveScale: number;
  activeScale: number;
}

export function isHeatmapHoverEffectEnabled(params: HeatmapHoverStyleParams): boolean {
  return params.inactiveOpacity !== 1 || params.inactiveScale !== 1 || params.activeScale !== 1;
}

export function isHeatmapInactiveEffectEnabled(
  inactiveOpacity: number,
  inactiveScale: number
): boolean {
  return isHeatmapHoverEffectEnabled({
    inactiveOpacity,
    inactiveScale,
    activeScale: 1,
  });
}

export function resolveHeatmapHoverStyle(
  isHighlighted: boolean,
  isDimmed: boolean,
  params: HeatmapHoverStyleParams
): { opacity: number; scale: number } {
  if (isHighlighted && params.activeScale !== 1) {
    return { opacity: 1, scale: params.activeScale };
  }

  if (isDimmed) {
    return {
      opacity: params.inactiveOpacity,
      scale: params.inactiveScale,
    };
  }

  return { opacity: 1, scale: 1 };
}

export function resolveHeatmapInactiveStyle(
  isInactive: boolean,
  inactiveOpacity: number,
  inactiveScale: number
): { opacity: number; scale: number } {
  return resolveHeatmapHoverStyle(false, isInactive, {
    inactiveOpacity,
    inactiveScale,
    activeScale: 1,
  });
}

export function resolveHeatmapRowOpacity(
  row: number,
  rowOpacity?: number | readonly number[]
): number {
  if (rowOpacity == null) {
    return 1;
  }

  if (typeof rowOpacity === 'number') {
    return rowOpacity;
  }

  return rowOpacity[row] ?? 1;
}

export function buildHeatmapRowOpacity(
  match: readonly number[] | ((row: number) => boolean),
  fadedOpacity = 0.35,
  activeOpacity = 1,
  rowCount = 7
): number[] {
  if (typeof match === 'function') {
    return Array.from({ length: rowCount }, (_, row) =>
      match(row) ? fadedOpacity : activeOpacity
    );
  }

  const opacity = new Array<number>(rowCount).fill(activeOpacity);
  for (const row of match) {
    if (row >= 0 && row < rowCount) {
      opacity[row] = fadedOpacity;
    }
  }
  return opacity;
}
