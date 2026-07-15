import React, { useMemo } from 'react';
import { scaleBand, scaleLinear } from '@visx/scale';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { LinePath } from '@visx/shape';
import { useBklitTheme } from '../hooks/useBklitTheme';
import { toContributorData } from '../data/gitVisMockData';

const WIDTH = 600;
const HEIGHT = 300;
const MARGIN = { top: 20, right: 60, bottom: 40, left: 60 };

export const ContributorStats = React.memo(function ContributorStats() {
  const theme = useBklitTheme();
  const data = useMemo(() => toContributorData(), []);

  const x0Scale = useMemo(
    () =>
      scaleBand({
        domain: data.map((d) => d.name),
        range: [MARGIN.left, WIDTH - MARGIN.right],
        padding: 0.3,
      }),
    [data]
  );
  const yScale = useMemo(
    () =>
      scaleLinear({
        domain: [0, Math.max(...data.map((d) => d.commits)) * 1.2],
        range: [HEIGHT - MARGIN.bottom, MARGIN.top],
      }),
    [data]
  );
  const lineMax = data.length > 0 ? Math.max(...data.flatMap((d) => [d.added, d.deleted])) * 1.2 : 1;
  const yLineScale = useMemo(
    () =>
      scaleLinear({
        domain: [0, lineMax],
        range: [HEIGHT - MARGIN.bottom, MARGIN.top],
      }),
    [lineMax]
  );

  return (
    <svg width="100%" height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
      {data.map((d) => (
        <rect
          key={d.name}
          x={x0Scale(d.name)}
          y={yScale(d.commits)}
          width={x0Scale.bandwidth()}
          height={HEIGHT - MARGIN.bottom - yScale(d.commits)}
          fill={theme.accent}
          rx={4}
        />
      ))}
      <LinePath
        data={data}
        x={(d) => (x0Scale(d.name) ?? 0) + x0Scale.bandwidth() / 2}
        y={(d) => yLineScale(d.added)}
        stroke={theme.seriesColors[0]}
        strokeWidth={2}
      />
      <LinePath
        data={data}
        x={(d) => (x0Scale(d.name) ?? 0) + x0Scale.bandwidth() / 2}
        y={(d) => yLineScale(d.deleted)}
        stroke={theme.seriesColors[2] ?? '#ef4444'}
        strokeWidth={2}
      />
      <AxisBottom top={HEIGHT - MARGIN.bottom} scale={x0Scale} />
      <AxisLeft scale={yScale} />
    </svg>
  );
});
