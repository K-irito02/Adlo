import React, { useMemo } from 'react';
import { LineChart, Line } from '@/components/charts/line-chart';
import { Grid } from '@/components/charts/grid';
import { ChartTooltip } from '@/components/charts/tooltip/chart-tooltip';
import { commitTimelineToRows } from '../adapters/chartDataAdapters';

interface CommitTimelineProps {
  data?: { commitTimeline: { date: string; cumulative: number }[] };
}

export const CommitTimeline = React.memo(function CommitTimeline({ data }: CommitTimelineProps) {
  const chartData = useMemo(() => (data?.commitTimeline ? commitTimelineToRows(data.commitTimeline) : []), [data]);

  return (
    <div className="adl-git-vis__chart" style={{ position: 'relative' }}>
      <LineChart
        data={chartData}
        xDataKey="date"
        margin={{ top: 20, right: 20, bottom: 40, left: 60 }}
        style={{ maxHeight: 280 }}
      >
        <Line dataKey="cumulative" />
        <Grid />
        <ChartTooltip />
      </LineChart>
    </div>
  );
});
