import React, { useMemo } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { ComposedChart } from '@/components/charts/composed-chart';
import { SeriesBar } from '@/components/charts/series-bar';
import { Line } from '@/components/charts/line';
import { Grid } from '@/components/charts/grid';
import { BarLoadingSkeleton } from '@/components/charts/loading-sweep';
import { useChartStable } from '@/components/charts/chart-context';
import { ChartTooltip } from '@/components/charts/tooltip/chart-tooltip';
import type { ChartStatus } from '@/components/charts/chart-phase';
import {
  ChartBrushLayout,
  ChartBrush,
  BRUSH_SELECTION_PATTERN,
  type BrushLayoutRenderProps,
} from '@/components/charts/brush';
import { XAxis } from '@/components/charts/x-axis';
import { YAxis } from '@/components/charts/y-axis';
import {
  aggregateCommitTimeline,
  commitCountLabelFor,
  dateLabelFormatterFor,
  periodEndInclusive,
  resolveGranularity,
  type Granularity,
} from '../adapters/chartDataAdapters';
import { GitNotRepoHint } from '../GitNotRepoHint';

interface CommitTimelineProps {
  data?: { days: { date: string; count: number; cumulative: number }[] };
  status?: ChartStatus;
  loadingLabel?: string;
  /** Whether the current workspace is a Git repository */
  isGitRepo?: boolean;
  /** Whether a workspace is selected */
  hasWorkspace?: boolean;
  /** Whether the git snapshot has been loaded (false during initial async load) */
  isGitSnapshotLoaded?: boolean;
}

export const CommitTimeline = React.memo(function CommitTimeline({
  data,
  status = 'ready',
  loadingLabel,
  isGitRepo = true,
  hasWorkspace = true,
  isGitSnapshotLoaded = true,
}: CommitTimelineProps) {
  const { t } = useTCopy();
  const days = useMemo(() => data?.days ?? [], [data]);

  const dayRows = useMemo(() => aggregateCommitTimeline(days, 'day'), [days]);

  const fullRange = useMemo(() => {
    if (dayRows.length === 0) {
      return { start: new Date(), end: new Date() };
    }
    return {
      start: new Date(dayRows[0].date + 'T00:00:00Z'),
      end: new Date(dayRows[dayRows.length - 1].date + 'T00:00:00Z'),
    };
  }, [dayRows]);

  const stripGranularity = useMemo<Granularity>(() => {
    if (dayRows.length === 0) {
      return 'month';
    }
    return resolveGranularity(fullRange.start, fullRange.end);
  }, [fullRange, dayRows.length]);

  const stripData = useMemo(
    () => aggregateCommitTimeline(days, stripGranularity),
    [days, stripGranularity],
  );

  // The brush track extends to the real last data day (not the last period
  // bucket, e.g. the final Monday) so the user can drag the brush into the
  // partial tail and zoom down to day granularity showing the true latest date.
  const stripTrackDomain = useMemo<[Date, Date] | undefined>(() => {
    if (stripData.length === 0) {
      return undefined;
    }
    return [new Date(stripData[0].date + 'T00:00:00Z'), fullRange.end];
  }, [stripData, fullRange.end]);

  if (!hasWorkspace) {
    return <GitNotRepoHint className="adl-git-vis__chart" message={t.gitVisNoWorkspace} />;
  }

  if (!isGitRepo && isGitSnapshotLoaded) {
    return <GitNotRepoHint className="adl-git-vis__chart" />;
  }

  if (status === 'loading' || !isGitSnapshotLoaded) {
    return (
      <div className="adl-git-vis__chart" style={{ position: 'relative', overflow: 'hidden' }}>
        <ComposedChart
          data={[]}
          xDataKey="date"
          status="loading"
          loadingLabel={loadingLabel}
          margin={{ top: 20, right: 60, bottom: 40, left: 60 }}
          style={{ maxHeight: 280 }}
        >
          <ComposedBarSkeleton />
          <Line
            dataKey="cumulative"
            stroke="transparent"
            strokeWidth={2}
            loadingStyle="sweep"
            showHighlight={false}
          />
          <Grid shimmer />
        </ComposedChart>
      </div>
    );
  }

  if (dayRows.length === 0) {
    return (
      <div className="adl-git-vis__chart" style={{ position: 'relative', overflow: 'hidden' }}>
        <ComposedChart
          data={[]}
          xDataKey="date"
          margin={{ top: 20, right: 20, bottom: 40, left: 60 }}
          style={{ maxHeight: 280 }}
        >
          <Line dataKey="cumulative" />
          <Grid />
          <ChartTooltip />
        </ComposedChart>
      </div>
    );
  }

  return (
    <div className="adl-git-vis__chart" style={{ position: 'relative', overflow: 'hidden' }}>
      <ChartBrushLayout
        data={stripData}
        xDataKey="date"
        enabled
        height={72}
        selectionEnd={fullRange.end}
        brushStrip={(layout) => (
          <ComposedChart
            data={stripData}
            xDataKey="date"
            xDomain={stripTrackDomain}
            animationDuration={0}
            status="ready"
            margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
            style={{ aspectRatio: 'unset', height: '100%' }}
          >
            <Line dataKey="count" animate={false} showHighlight={false} />
            <ChartBrush
              initialSelection={layout.brushSelection ?? undefined}
              onSelectionChange={
                layout.onBrushSelectionChange as (domain: { start: Date; end: Date }) => void
              }
              selectionPattern={BRUSH_SELECTION_PATTERN}
            />
          </ComposedChart>
        )}
      >
        {(layout) => <CommitTimelineMain layout={layout} days={days} fullRange={fullRange} />}
      </ChartBrushLayout>
    </div>
  );
});

interface CommitTimelineMainProps {
  layout: BrushLayoutRenderProps;
  days: { date: string; count: number; cumulative: number }[];
  fullRange: { start: Date; end: Date };
}

/**
 * Main chart (zoomed view) extracted into its own component so the expensive
 * data filtering, aggregation, and x-domain clamping can be memoized via
 * `useMemo`. See `CodeLineEvoMain` for the full rationale — the same jitter
 * loop existed here because `chartData` and `mainXDomain` were rebuilt as new
 * references on every render, churning `xScale` → `resolveTooltipFromX` → the
 * reanchor `useEffect`.
 */
const CommitTimelineMain = React.memo(function CommitTimelineMain({
  layout,
  days,
  fullRange,
}: CommitTimelineMainProps) {
  const { t } = useTCopy();
  const selStart = useMemo(
    () => layout.xDomain?.[0] ?? fullRange.start,
    [layout.xDomain, fullRange.start],
  );
  const selEnd = useMemo(
    () => layout.xDomain?.[1] ?? fullRange.end,
    [layout.xDomain, fullRange.end],
  );
  const granularity = resolveGranularity(selStart, selEnd);
  const dateLabelFormatter = useMemo(() => dateLabelFormatterFor(granularity), [granularity]);
  const countLabel = useMemo(
    () =>
      commitCountLabelFor(granularity, {
        day: t.gitVisCommitTimelineCountDay,
        week: t.gitVisCommitTimelineCountWeek,
        month: t.gitVisCommitTimelineCountMonth,
      }),
    [
      granularity,
      t.gitVisCommitTimelineCountDay,
      t.gitVisCommitTimelineCountWeek,
      t.gitVisCommitTimelineCountMonth,
    ],
  );

  const { chartData, mainXDomain } = useMemo(() => {
    const periodEndMs = periodEndInclusive(selEnd, granularity).getTime();
    const inRangeDays = days.filter((d) => {
      const t = new Date(d.date + 'T00:00:00Z').getTime();
      // Keep the final partial period (e.g. the last week whose Monday is
      // the selection end) fully included so its data is not dropped.
      return t >= selStart.getTime() && t <= periodEndMs;
    });
    const aggregated = aggregateCommitTimeline(inRangeDays, granularity);
    // Clamp the visible x-domain to the chart's own last data point so the
    // aggregated view (e.g. weekly, whose last bucket is the final Monday)
    // does not leave empty space on the right, while day granularity still
    // reaches the true latest data day.
    let domain = layout.xDomain;
    const lastDataPoint = aggregated.at(-1);
    if (domain && lastDataPoint) {
      const lastTime = new Date(lastDataPoint.date + 'T00:00:00Z').getTime();
      if (!Number.isNaN(lastTime) && domain[1].getTime() > lastTime) {
        domain = [domain[0], new Date(lastTime)];
      }
    }
    return { chartData: aggregated, mainXDomain: domain };
  }, [days, selStart, selEnd, granularity, layout.xDomain]);

  return (
    <ComposedChart
      data={chartData}
      xDataKey="date"
      animationDuration={400}
      barGap={0}
      maxBarSize={granularity === 'day' ? 8 : 24}
      xDomain={mainXDomain}
      // The main chart re-aggregates the selected range at its own
      // granularity (e.g. daily when the strip is weekly), so bar/slot
      // padding must use this chart's row count — not the strip's.
      xDomainSlotCount={chartData.length}
      // Snap y-domains on data/x-domain changes instead of tweening:
      // a tween renders new series values with the interpolated (still
      // small) domain, sending lines far off the plot top before the
      // tween settles, and re-triggers the animated series path every
      // frame (y-scale churn) which can exceed React's update depth.
      tweenYDomainOnXDomainChange={false}
      yDomainTween={false}
      dateLabelFormatter={dateLabelFormatter}
      margin={{ top: 20, right: 60, bottom: 40, left: 60 }}
      style={{ maxHeight: 280 }}
    >
      <SeriesBar dataKey="count" yAxisId="right" fill="var(--chart-line-primary)" radius={4} />
      <Line dataKey="cumulative" stroke="var(--chart-line-secondary)" strokeWidth={2} />
      <Grid />
      <XAxis />
      <YAxis numTicks={4} />
      <YAxis yAxisId="right" orientation="right" numTicks={4} />
      <ChartTooltip
        rows={(point) => [
          {
            color: 'var(--chart-line-primary)',
            label: countLabel,
            value: (point.count as number) ?? 0,
          },
          {
            color: 'var(--chart-line-secondary)',
            label: t.gitVisCommitTimelineCumulative,
            value: (point.cumulative as number) ?? 0,
          },
        ]}
      />
    </ComposedChart>
  );
});

/**
 * Official gray bar skeleton (bklit-ui BarLoadingSkeleton): var(--chart-foreground) + 0.45
 * opacity, 12 bars, 0.7 barFraction, with a sweep shimmer. Reads inner dimensions
 * from ChartContext and renders inside ComposedChart's loading state.
 */
const ComposedBarSkeleton = React.memo(function ComposedBarSkeleton() {
  const { innerWidth, innerHeight } = useChartStable();
  if (innerWidth <= 0 || innerHeight <= 0) {
    return null;
  }
  return (
    <g className="composed-bar-skeleton">
      <BarLoadingSkeleton innerWidth={innerWidth} innerHeight={innerHeight} />
    </g>
  );
});
