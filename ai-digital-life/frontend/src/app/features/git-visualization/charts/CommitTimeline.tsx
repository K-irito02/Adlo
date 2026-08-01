import React, { useMemo } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { ComposedChart } from '@/components/charts/composed-chart';
import { SeriesBar } from '@/components/charts/series-bar';
import { Line } from '@/components/charts/line';
import { Grid } from '@/components/charts/grid';
import { ChartTooltip } from '@/components/charts/tooltip/chart-tooltip';
import { ChartBrushLayout, ChartBrush } from '@/components/charts/brush';
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

interface CommitTimelineProps {
  data?: { days: { date: string; count: number; cumulative: number }[] };
}

export const CommitTimeline = React.memo(function CommitTimeline({ data }: CommitTimelineProps) {
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

  if (dayRows.length === 0) {
    return (
      <div className="adl-git-vis__chart" style={{ position: 'relative' }}>
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
    <div className="adl-git-vis__chart" style={{ position: 'relative' }}>
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
            />
          </ComposedChart>
        )}
      >
        {(layout) => {
          const selStart = layout.xDomain?.[0] ?? fullRange.start;
          const selEnd = layout.xDomain?.[1] ?? fullRange.end;
          const granularity = resolveGranularity(selStart, selEnd);
          const periodEndMs = periodEndInclusive(selEnd, granularity).getTime();
          const inRangeDays = days.filter((d) => {
            const t = new Date(d.date + 'T00:00:00Z').getTime();
            // Keep the final partial period (e.g. the last week whose Monday is
            // the selection end) fully included so its data is not dropped.
            return t >= selStart.getTime() && t <= periodEndMs;
          });
          const chartData = aggregateCommitTimeline(inRangeDays, granularity);
          // Clamp the visible x-domain to the chart's own last data point so the
          // aggregated view (e.g. weekly, whose last bucket is the final Monday)
          // does not leave empty space on the right, while day granularity still
          // reaches the true latest data day.
          let mainXDomain = layout.xDomain;
          const lastDataPoint = chartData.at(-1);
          if (mainXDomain && lastDataPoint) {
            const lastTime = new Date(lastDataPoint.date + 'T00:00:00Z').getTime();
            if (mainXDomain[1].getTime() > lastTime) {
              mainXDomain = [mainXDomain[0], new Date(lastTime)];
            }
          }
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
              dateLabelFormatter={dateLabelFormatterFor(granularity)}
              margin={{ top: 20, right: 60, bottom: 40, left: 60 }}
              style={{ maxHeight: 280 }}
            >
              <SeriesBar
                dataKey="count"
                yAxisId="right"
                fill="var(--chart-line-primary)"
                radius={4}
              />
              <Line dataKey="cumulative" stroke="var(--chart-line-secondary)" strokeWidth={2} />
              <Grid />
              <XAxis />
              <YAxis numTicks={4} />
              <YAxis yAxisId="right" orientation="right" numTicks={4} />
              <ChartTooltip
                rows={(point) => [
                  {
                    color: 'var(--chart-line-primary)',
                    label: commitCountLabelFor(granularity, {
                      day: t.gitVisCommitTimelineCountDay,
                      week: t.gitVisCommitTimelineCountWeek,
                      month: t.gitVisCommitTimelineCountMonth,
                    }),
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
        }}
      </ChartBrushLayout>
    </div>
  );
});
