import React, { useMemo } from 'react';
import { scaleBand, scaleLinear } from '@visx/scale';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { useBklitTheme } from '../hooks/useBklitTheme';
import { toContributorData } from '../data/gitVisMockData';

const WIDTH = 600;
const HEIGHT = 300;
const MARGIN = { top: 20, right: 20, bottom: 40, left: 60 };

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
      <AxisBottom top={HEIGHT - MARGIN.bottom} scale={x0Scale} />
      <AxisLeft scale={yScale} />
    </svg>
  );
});
