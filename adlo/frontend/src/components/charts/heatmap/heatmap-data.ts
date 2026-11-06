/**
 * Fixed fallback level used when a dataset has no distribution to normalize
 * (zero or one distinct positive value). It is also the default resolver for
 * consumers that do not provide a dataset-aware one.
 */
export function getHeatmapContributionLevel(count: number | null | undefined): number {
  if (count == null || !Number.isFinite(count) || count <= 0) {
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

/** Maps a cell count to one of the five heatmap levels (0–4). */
export type HeatmapLevelResolver = (count: number | null | undefined) => number;

export interface HeatmapLevelThresholds {
  /**
   * Inclusive upper bounds for levels 1–3. Values strictly above the third
   * bound map to level 4, so the current maximum receives the darkest color
   * when `strategy` is `quantile`.
   *
   * For `strategy: 'fixed'` these values are unused: the resolver falls back to
   * the semantic 1 / 2 / 3 / ≥4 boundaries instead.
   */
  thresholds: readonly [number, number, number];
  /**
   * `quantile` when the dataset has at least two distinct positive values,
   * otherwise `fixed` (see {@link getHeatmapContributionLevel}).
   */
  strategy: 'fixed' | 'quantile';
}

/**
 * Derives data-driven level boundaries from the counts currently visible in a
 * chart. Zero stays level 0; positive counts are distributed into up to four
 * buckets around P25 / P50 / P75. This keeps sparse GitHub-style data readable
 * instead of sending every count ≥ 4 to the darkest color.
 *
 * Boundaries are nudged forward across distinct values so tied quantiles cannot
 * collapse levels 2/3 into the darkest level: with 100×`1` plus `2`, `3`, `4`,
 * the boundaries become 1 / 2 / 3 instead of 1 / 1 / 1. When there are fewer
 * distinct values than boundaries, a level may legitimately stay empty.
 *
 * Excludes non-positive entries (empty cells and the `-1` ghost sentinel) so
 * they cannot drag the quantiles down. Datasets whose positive values are all
 * identical have nothing to normalize, so they fall back to the fixed
 * semantic scale (1 → lightest, ≥4 → darkest).
 */
export function buildHeatmapLevelThresholds(counts: Iterable<number>): HeatmapLevelThresholds {
  const positive: number[] = [];
  for (const count of counts) {
    if (Number.isFinite(count) && count > 0) {
      positive.push(count);
    }
  }

  if (positive.length === 0) {
    return { thresholds: [0, 0, 0], strategy: 'fixed' };
  }

  positive.sort((a, b) => a - b);
  const max = positive[positive.length - 1];
  const distinct = [...new Set(positive)];
  if (distinct.length < 2) {
    return { thresholds: [max, max, max], strategy: 'fixed' };
  }

  const quantile = (p: number) => positive[Math.floor((positive.length - 1) * p)];
  // Keep the maximum strictly above the last boundary so level 4 is reachable
  // even when the top quartile is flat (many cells share the maximum). The
  // half-step shrinks for fractional maxima so the cap stays positive.
  const cap = max - Math.min(0.5, max / 2);
  const nextDistinctBoundary = (target: number, above: number): number => {
    const candidate = distinct.find((value) => value > above && value >= target);
    return candidate === undefined ? cap : Math.min(candidate, cap);
  };

  const first = nextDistinctBoundary(quantile(0.25), 0);
  const second = Math.max(first, nextDistinctBoundary(quantile(0.5), first));
  const third = Math.max(second, nextDistinctBoundary(quantile(0.75), second));

  return { thresholds: [first, second, third], strategy: 'quantile' };
}

export function createHeatmapLevelResolver(
  levelThresholds: HeatmapLevelThresholds,
): HeatmapLevelResolver {
  if (levelThresholds.strategy === 'fixed') {
    return (count) => getHeatmapContributionLevel(count ?? 0);
  }

  const [first, second, third] = levelThresholds.thresholds;
  return (count) => {
    if (count == null || !Number.isFinite(count) || count <= 0) {
      return 0;
    }
    if (count <= first) {
      return 1;
    }
    if (count <= second) {
      return 2;
    }
    if (count <= third) {
      return 3;
    }
    return 4;
  };
}

/** Convenience wrapper around {@link buildHeatmapLevelThresholds}. */
export function buildHeatmapLevelResolver(counts: Iterable<number>): HeatmapLevelResolver {
  return createHeatmapLevelResolver(buildHeatmapLevelThresholds(counts));
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
  labelFormat: HeatmapYAxisLabelFormat,
): string {
  return labelFormat === 'initial' ? label.charAt(0) : label;
}

export function shouldShowHeatmapYAxisTick(
  row: number,
  tickFilter: HeatmapYAxisTickFilter,
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
  inactiveScale: number,
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
  params: HeatmapHoverStyleParams,
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
  inactiveScale: number,
): { opacity: number; scale: number } {
  return resolveHeatmapHoverStyle(false, isInactive, {
    inactiveOpacity,
    inactiveScale,
    activeScale: 1,
  });
}

export function resolveHeatmapRowOpacity(
  row: number,
  rowOpacity?: number | readonly number[],
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
  rowCount = 7,
): number[] {
  if (typeof match === 'function') {
    return Array.from({ length: rowCount }, (_, row) =>
      match(row) ? fadedOpacity : activeOpacity,
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
