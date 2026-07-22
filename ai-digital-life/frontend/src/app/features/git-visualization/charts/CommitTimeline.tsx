import React, { useMemo } from 'react';
import { LineChart, Line } from '@/components/charts/line-chart';
import { Grid } from '@/components/charts/grid';
import { ChartTooltip } from '@/components/charts/tooltip/chart-tooltip';
import { mockCommitTimelineData } from '../data/gitVisMockData';

export const CommitTimeline = React.memo(function CommitTimeline() {
  const data = useMemo(() => mockCommitTimelineData, []);

  return (
    <div className="adl-git-vis__chart" style={{ position: 'relative' }}>
      <LineChart
        data={data}
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
