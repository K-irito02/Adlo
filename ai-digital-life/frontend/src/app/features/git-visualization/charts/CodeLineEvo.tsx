import React, { useMemo } from 'react';
import { LineChart, Line } from '@/components/charts/line-chart';
import { Grid } from '@/components/charts/grid';
import { ChartTooltip } from '@/components/charts/tooltip/chart-tooltip';
import { generateCodeLineEvolutionData, toBklitAreaData } from '../data/gitVisMockData';

export const CodeLineEvo = React.memo(function CodeLineEvo() {
  const data = useMemo(() => toBklitAreaData(generateCodeLineEvolutionData()), []);

  return (
    <div className="adl-git-vis__chart" style={{ position: 'relative' }}>
      <LineChart
        data={data}
        xDataKey="date"
        margin={{ top: 20, right: 20, bottom: 40, left: 60 }}
        style={{ maxHeight: 280 }}
      >
        <Line dataKey="added" />
        <Line dataKey="deleted" stroke="var(--chart-line-secondary)" />
        <Grid />
        <ChartTooltip />
      </LineChart>
    </div>
  );
});
