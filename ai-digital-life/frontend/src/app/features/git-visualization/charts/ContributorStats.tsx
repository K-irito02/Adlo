import React, { useMemo } from 'react';
import { BarChart, Bar } from '@/components/charts/bar-chart';
import { Grid } from '@/components/charts/grid';
import { ChartTooltip } from '@/components/charts/tooltip/chart-tooltip';
import { useBklitTheme } from '../hooks/useBklitTheme';
import { toContributorData } from '../data/gitVisMockData';

export const ContributorStats = React.memo(function ContributorStats() {
  const theme = useBklitTheme();
  const data = useMemo(() => toContributorData(), []);

  if (data.length === 0) {
    return null;
  }

  return (
    <div className="adl-git-vis__chart" style={{ position: 'relative' }}>
      <BarChart data={data} xDataKey="name" margin={{ top: 20, right: 60, bottom: 40, left: 60 }}>
        <Bar dataKey="commits" fill={theme.accent} />
        <Grid />
        <ChartTooltip />
      </BarChart>
    </div>
  );
});
