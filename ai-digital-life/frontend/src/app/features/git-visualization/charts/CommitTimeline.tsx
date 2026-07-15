import React, { useMemo } from 'react';
import { LineChart, Line } from '@/components/charts/line-chart';
import { Grid } from '@/components/charts/grid';
import { ChartTooltip } from '@/components/charts/tooltip/chart-tooltip';
import { useBklitTheme } from '../hooks/useBklitTheme';
import { mockCommitTimelineData } from '../data/gitVisMockData';

export const CommitTimeline = React.memo(function CommitTimeline() {
  const theme = useBklitTheme();
  const data = useMemo(() => mockCommitTimelineData, []);

  return (
    <div className="adl-git-vis__chart" style={{ position: 'relative' }}>
      <LineChart data={data} xDataKey="date" margin={{ top: 20, right: 20, bottom: 40, left: 60 }}>
        <Line dataKey="cumulative" stroke={theme.accent} />
        <Grid />
        <ChartTooltip />
      </LineChart>
    </div>
  );
});
