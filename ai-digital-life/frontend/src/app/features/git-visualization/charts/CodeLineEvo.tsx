import React, { useMemo } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { LineChart, Line } from '@/components/charts/line-chart';
import { Area } from '@/components/charts/area';
import { Grid } from '@/components/charts/grid';
import { ChartTooltip } from '@/components/charts/tooltip/chart-tooltip';
import { ChartBrushLayout, ChartBrush } from '@/components/charts/brush';
import { XAxis } from '@/components/charts/x-axis';
import {
  aggregateCodeEvolutionDays,
  resolveGranularity,
  type Granularity,
} from '../adapters/chartDataAdapters';

interface CodeLineEvoProps {
  data?: { days: { date: string; additions: number; deletions: number }[] };
}

export const CodeLineEvo = React.memo(function CodeLineEvo({ data }: CodeLineEvoProps) {
  const { t } = useTCopy();
  const days = useMemo(() => data?.days ?? [], [data]);

  const dayRows = useMemo(() => aggregateCodeEvolutionDays(days, 'day'), [days]);

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
    () => aggregateCodeEvolutionDays(days, stripGranularity),
    [days, stripGranularity],
  );

  if (dayRows.length === 0) {
    return (
      <div className="adl-git-vis__chart" style={{ position: 'relative' }}>
        <LineChart
          data={[]}
          xDataKey="date"
          margin={{ top: 20, right: 20, bottom: 40, left: 60 }}
          style={{ maxHeight: 280 }}
        >
          <Line dataKey="net" />
          <Grid highlightRowValues={[0]} />
          <ChartTooltip />
        </LineChart>
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
          <LineChart
            data={stripData}
            xDataKey="date"
            animationDuration={0}
            status="ready"
            margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
            style={{ aspectRatio: 'unset', height: '100%' }}
          >
            <Line dataKey="net" animate={false} showHighlight={false} />
            <ChartBrush
              initialSelection={layout.brushSelection ?? undefined}
              onSelectionChange={
                layout.onBrushSelectionChange as (domain: { start: Date; end: Date }) => void
              }
            />
          </LineChart>
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
          const chartData = aggregateCodeEvolutionDays(inRangeDays, granularity);
          return (
            <LineChart
              data={chartData}
              xDataKey="date"
              xDomain={layout.xDomain}
              xDomainSlotCount={layout.xDomainSlotCount}
              tweenYDomainOnXDomainChange
              yDomainTween
              dateLabelFormatter={dateLabelFormatterFor(granularity)}
              margin={{ top: 20, right: 20, bottom: 40, left: 60 }}
              style={{ maxHeight: 280 }}
            >
              <Area
                dataKey="added"
                baseline="zero"
                fill="var(--chart-line-primary)"
                fillOpacity={0.35}
              />
              <Area
                dataKey="deletedNeg"
                baseline="zero"
                fill="var(--chart-line-secondary)"
                fillOpacity={0.35}
              />
              <Line dataKey="net" stroke="var(--chart-3)" strokeWidth={2} />
              <Grid highlightRowValues={[0]} />
              <XAxis />
              <ChartTooltip
                rows={(point) => [
                  {
                    color: 'var(--chart-line-primary)',
                    label: t.gitVisCodeLineEvoAdded,
                    value: (point.added as number) ?? 0,
                  },
                  {
                    color: 'var(--chart-line-secondary)',
                    label: t.gitVisCodeLineEvoDeleted,
                    value: (point.deletedNeg as number) ?? 0,
                  },
                  {
                    color: 'var(--chart-3)',
                    label: t.gitVisCodeLineEvoNet,
                    value: (point.net as number) ?? 0,
                  },
                ]}
              />
            </LineChart>
          );
        }}
      </ChartBrushLayout>
    </div>
  );
});
