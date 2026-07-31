import React, { useMemo } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { ComposedChart } from '@/components/charts/composed-chart';
import { SeriesBar } from '@/components/charts/series-bar';
import { Line } from '@/components/charts/line';
import { Grid } from '@/components/charts/grid';
import { ChartTooltip } from '@/components/charts/tooltip/chart-tooltip';
import { ChartBrushLayout, ChartBrush } from '@/components/charts/brush';
import { XAxis } from '@/components/charts/x-axis';
import {
  aggregateCommitTimeline,
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
      start: new Date(dayRows[0].date + 'T00:00:00'),
      end: new Date(dayRows[dayRows.length - 1].date + 'T00:00:00'),
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

  const dateLabelFormatterFor = (g: Granularity) => (d: Date) =>
    g === 'month'
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      : `${d.getMonth() + 1}/${d.getDate()}`;

  return (
    <div className="adl-git-vis__chart" style={{ position: 'relative' }}>
      <ChartBrushLayout
        data={stripData}
        xDataKey="date"
        enabled
        height={72}
        brushStrip={(layout) => (
          <ComposedChart
            data={stripData}
            xDataKey="date"
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
          const inRangeDays = days.filter((d) => {
            const t = new Date(d.date + 'T00:00:00').getTime();
            return t >= selStart.getTime() && t <= selEnd.getTime();
          });
          const chartData = aggregateCommitTimeline(inRangeDays, granularity);
          return (
            <ComposedChart
              data={chartData}
              xDataKey="date"
              barGap={0}
              maxBarSize={granularity === 'day' ? 8 : 24}
              xDomain={layout.xDomain}
              xDomainSlotCount={layout.xDomainSlotCount}
              tweenYDomainOnXDomainChange
              yDomainTween
              dateLabelFormatter={dateLabelFormatterFor(granularity)}
              margin={{ top: 20, right: 20, bottom: 40, left: 60 }}
              style={{ maxHeight: 280 }}
            >
              <SeriesBar dataKey="count" fill="var(--chart-line-primary)" radius={4} />
              <Line dataKey="cumulative" stroke="var(--chart-line-secondary)" strokeWidth={2} />
              <Grid />
              <XAxis />
              <ChartTooltip
                rows={(point) => [
                  {
                    color: 'var(--chart-line-primary)',
                    label: t.gitVisCommitTimelineCount,
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
