import React, { useMemo } from 'react';
import { LineChart, Line } from '@/components/charts/line-chart';
import { Grid } from '@/components/charts/grid';
import { ChartTooltip } from '@/components/charts/tooltip/chart-tooltip';
import { codeEvolutionToAreaData } from '../adapters/chartDataAdapters';

interface CodeLineEvoProps {
  data?: { weeks: { weekStart: string; additions: number; deletions: number }[] };
}

export const CodeLineEvo = React.memo(function CodeLineEvo({ data }: CodeLineEvoProps) {
  const chartData = useMemo(() => (data?.weeks ? codeEvolutionToAreaData(data.weeks) : []), [data]);

  return (
    <div className="adl-git-vis__chart" style={{ position: 'relative' }}>
      <LineChart
        data={chartData}
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
