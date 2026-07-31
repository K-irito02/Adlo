import React, { useMemo } from 'react';
import { LineChart, Line } from '@/components/charts/line-chart';
import { Grid } from '@/components/charts/grid';
import { ChartTooltip } from '@/components/charts/tooltip/chart-tooltip';
import { ChartBrushLayout, ChartBrush } from '@/components/charts/brush';
import { codeEvolutionToAreaData } from '../adapters/chartDataAdapters';

interface CodeLineEvoProps {
  data?: { weeks: { weekStart: string; additions: number; deletions: number }[] };
}

export const CodeLineEvo = React.memo(function CodeLineEvo({ data }: CodeLineEvoProps) {
  const chartData = useMemo(() => (data?.weeks ? codeEvolutionToAreaData(data.weeks) : []), [data]);

  if (chartData.length === 0) {
    return (
      <div className="adl-git-vis__chart" style={{ position: 'relative' }}>
        <LineChart data={[]} xDataKey="date" margin={{ top: 20, right: 20, bottom: 40, left: 60 }} style={{ maxHeight: 280 }}>
          <Line dataKey="added" />
          <Line dataKey="deleted" stroke="var(--chart-line-secondary)" />
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
            margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
            style={{ aspectRatio: 'unset', height: '100%' }}
          >
            <Line dataKey="added" animate={false} showHighlight={false} />
            <Line dataKey="deleted" stroke="var(--chart-line-secondary)" animate={false} showHighlight={false} />
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
            <Line dataKey="added" />
            <Line dataKey="deleted" stroke="var(--chart-line-secondary)" />
            <Grid />
            <ChartTooltip />
          </LineChart>
        )}
      </ChartBrushLayout>
    </div>
  );
});
