'use client';

import { curveNatural } from '@visx/curve';
import { useMemo } from 'react';
import type { Margin } from './chart-context';
import type { LoadingStyle } from './chart-phase';
import {
  DEFAULT_SKELETON_DATA_KEY,
  DEFAULT_SKELETON_POINT_COUNT,
  generateChartSkeletonData,
} from './generate-chart-skeleton-data';
import { Grid } from './grid';
import { Line } from './line';
import { LineChart } from './line-chart';

const LOADING_DATA_KEY = DEFAULT_SKELETON_DATA_KEY;
const DEFAULT_LOADING_STROKE = 'var(--chart-foreground)';
const DEFAULT_LOADING_GRID_STROKE = 'color-mix(in oklch, var(--chart-grid) 50%, transparent)';
const DEFAULT_LOADING_GRID_SHIMMER_STROKE =
  'color-mix(in oklch, var(--chart-foreground) 68%, transparent)';
const DEFAULT_LOADING_STROKE_OPACITY = 0.5;

/** One skeleton line in a multi-series loading skeleton. */
export interface LineChartLoadingSeries {
  /** Unique data key for this skeleton line. Default: `loading-N`. */
  dataKey?: string;
  /** Stroke color for this skeleton line. Default: `var(--chart-foreground)`. */
  stroke?: string;
  /** Stroke opacity for this skeleton line. Default: 0.5. */
  strokeOpacity?: number;
  /** Fractional phase offset [0,1) of the sweep loop, to desync multiple lines. */
  phaseOffset?: number;
}

export interface LineChartLoadingProps {
  /** Chart margins */
  margin?: Partial<Margin>;
  /** Stroke color for the animated loading segment. */
  stroke?: string;
  /** Stroke opacity for the animated loading segment. Default: 0.5 */
  strokeOpacity?: number;
  /** Grid line stroke (color and opacity via color-mix or oklch alpha). */
  gridStroke?: string;
  /** Shimmer band stroke (color and opacity via color-mix or oklch alpha). */
  gridShimmerStroke?: string;
  /** Animate a shimmer band across grid lines. Default: true */
  gridShimmer?: boolean;
  /** Shimmer band width in pixels. Default: 140 */
  gridShimmerLength?: number;
  /** Shimmer speed multiplier (higher = faster). Default: 1 */
  gridShimmerSpeed?: number;
  /** Match shimmer loop to the loading line pulse (cycle + inter-loop pause). */
  gridShimmerSync?: boolean;
  /** Loading animation: `"pulse"` (default traveling pulse) or `"sweep"` (a
   * diagonal shimmer across the skeleton line). Default: `"pulse"`. When
   * `series` is provided this defaults to `"sweep"` (multiple lines sweep
   * out of phase). */
  loadingStyle?: LoadingStyle;
  /**
   * Multiple skeleton lines to render (e.g. togglable chart series). Each
   * line gets its own stroke and sweep phase offset so multi-line skeletons
   * are not in lockstep. When omitted a single skeleton line is rendered.
   */
  series?: LineChartLoadingSeries[];
  /** Centered shimmer label text. Default: "Loading" */
  label?: string;
  /** Aspect ratio as "width / height". Default: "2 / 1" */
  aspectRatio?: string;
  /** Additional class name for the container */
  className?: string;
}

/** Skeleton rows carrying every requested series key, so each line has its own
 * y-magnitude and reads as a distinct series. */
function generateMultiSeriesSkeletonData(keys: string[]): Record<string, unknown>[] {
  const primaryKey = keys[0] ?? DEFAULT_SKELETON_DATA_KEY;
  const base = generateChartSkeletonData({
    dataKey: primaryKey,
    pointCount: DEFAULT_SKELETON_POINT_COUNT,
  });
  if (keys.length <= 1) {
    return base;
  }
  return base.map((row, index) => {
    const next = { ...row };
    keys.slice(1).forEach((key, i) => {
      next[key] = Math.round(60 + Math.sin(index * 1.05 + i * 0.7) * 30 + (i % 3) * 14);
    });
    return next;
  });
}

export function LineChartLoading({
  margin,
  stroke = DEFAULT_LOADING_STROKE,
  strokeOpacity = DEFAULT_LOADING_STROKE_OPACITY,
  gridStroke = DEFAULT_LOADING_GRID_STROKE,
  gridShimmerStroke = DEFAULT_LOADING_GRID_SHIMMER_STROKE,
  gridShimmer = true,
  gridShimmerLength,
  gridShimmerSpeed,
  gridShimmerSync = false,
  loadingStyle,
  series,
  label = 'Loading',
  aspectRatio = '2 / 1',
  className = '',
}: LineChartLoadingProps) {
  const resolvedLoadingStyle = loadingStyle ?? (series && series.length > 1 ? 'sweep' : 'pulse');

  const data = useMemo(
    () => {
      const dataKeys =
        series && series.length > 0
          ? series.map((s, i) => s.dataKey ?? `loading-${i}`)
          : [LOADING_DATA_KEY];
      return generateMultiSeriesSkeletonData(dataKeys);
    },
    // `series` is the true input; deriving keys inside keeps the memo keyed on a
    // stable caller-provided identity.
    [series],
  );

  return (
    <LineChart
      animationDuration={0}
      aspectRatio={aspectRatio}
      className={className}
      data={data}
      loadingLabel={label}
      margin={margin}
      status="loading"
    >
      <Grid
        horizontal
        shimmer={resolvedLoadingStyle === 'sweep' ? false : gridShimmer}
        shimmerLength={gridShimmerLength}
        shimmerSpeed={gridShimmerSpeed}
        shimmerStroke={gridShimmerStroke}
        shimmerSync={gridShimmerSync}
        stroke={gridStroke}
      />
      {series && series.length > 0 ? (
        series.map((s, i) => (
          <Line
            key={s.dataKey ?? `loading-${i}`}
            curve={curveNatural}
            dataKey={s.dataKey ?? `loading-${i}`}
            fadeEdges={false}
            loadingStroke={s.stroke ?? stroke}
            loadingStrokeOpacity={s.strokeOpacity ?? strokeOpacity}
            loadingStyle={resolvedLoadingStyle}
            loadingSweepPhaseOffset={s.phaseOffset ?? (series.length > 1 ? i / series.length : 0)}
            showHighlight={false}
            stroke="transparent"
            strokeWidth={2.5}
          />
        ))
      ) : (
        <Line
          curve={curveNatural}
          dataKey={LOADING_DATA_KEY}
          fadeEdges={false}
          loadingStroke={stroke}
          loadingStrokeOpacity={strokeOpacity}
          loadingStyle={resolvedLoadingStyle}
          showHighlight={false}
          stroke="transparent"
          strokeWidth={2.5}
        />
      )}
    </LineChart>
  );
}

export default LineChartLoading;
