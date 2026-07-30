import React, { useMemo } from 'react';
import { LineChart, Line } from '@/components/charts/line-chart';
import { Grid } from '@/components/charts/grid';
import { ChartTooltip } from '@/components/charts/tooltip/chart-tooltip';
import { ChartBrushLayout, ChartBrush } from '@/components/charts/brush';
import { commitTimelineToRows } from '../adapters/chartDataAdapters';

interface CommitTimelineProps {
  data?: { commitTimeline: { date: string; cumulative: number }[] };
}

export const CommitTimeline = React.memo(function CommitTimeline({ data }: CommitTimelineProps) {
  const chartData = useMemo(
    () => (data?.commitTimeline ? commitTimelineToRows(data.commitTimeline) : []),
    [data],
  );

  if (chartData.length === 0) {
    return (
      <div className="adl-git-vis__chart" style={{ position: 'relative' }}>
        <LineChart data={[]} xDataKey="date" margin={{ top: 20, right: 20, bottom: 40, left: 60 }} style={{ maxHeight: 280 }}>
          <Line dataKey="cumulative" />
          <Grid />
          <ChartTooltip />
        </LineChart>
      </div>
    );
  }

  return (
    <div className="adl-git-vis__chart" style={{ position: 'relative' }}>
      <ChartBrushLayout
        data={chartData}
        xDataKey="date"
        enabled
        height={72}
        brushStrip={(layout) => (
          <LineChart
            data={chartData}
            xDataKey="date"
            animationDuration={0}
            status="ready"
            style={{ aspectRatio: 'unset', height: '100%' }}
          >
            <Line dataKey="cumulative" animate={false} showHighlight={false} />
            <ChartBrush
              initialSelection={layout.brushSelection ?? undefined}
              onSelectionChange={layout.onBrushSelectionChange as (domain: { start: Date; end: Date }) => void}
            />
          </LineChart>
        )}
      >
        {(layout) => (
          <LineChart
            data={chartData}
            xDataKey="date"
            xDomain={layout.xDomain}
            xDomainSlotCount={layout.xDomainSlotCount}
            tweenYDomainOnXDomainChange
            yDomainTween
            margin={{ top: 20, right: 20, bottom: 40, left: 60 }}
            style={{ maxHeight: 280 }}
          >
            <Line dataKey="cumulative" />
            <Grid />
            <ChartTooltip />
          </LineChart>
        )}
      </ChartBrushLayout>
    </div>
  );
});
