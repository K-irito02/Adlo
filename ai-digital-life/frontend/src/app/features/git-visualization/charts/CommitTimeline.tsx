import React, { useMemo } from 'react';
import { scaleTime, scaleLinear } from '@visx/scale';
import { LinePath } from '@visx/shape';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { curveMonotoneX } from '@visx/curve';
import { useBklitTheme } from '../hooks/useBklitTheme';
import { mockCommitTimelineData } from '../data/gitVisMockData';

const W = 600;
const H = 300;
const MARGIN = { top: 20, right: 20, bottom: 40, left: 60 };

export const CommitTimeline = React.memo(function CommitTimeline() {
  const theme = useBklitTheme();
  const data = useMemo(() => mockCommitTimelineData, []);
  const dates = data.map((d) => new Date(d.date));
  const dateNums = dates.map((d) => d.getTime());

  const xScale = useMemo(
    () =>
      scaleTime({
        domain: [Math.min(...dateNums), Math.max(...dateNums)],
        range: [MARGIN.left, W - MARGIN.right],
      }),
    [dateNums]
  );
  const yScale = useMemo(
    () =>
      scaleLinear({
        domain: [0, Math.max(...data.map((d) => d.cumulative)) * 1.1],
        range: [H - MARGIN.bottom, MARGIN.top],
      }),
    [data]
  );

  return (
    <div className="adl-git-vis__chart">
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        {data.map((d, i) => (
          <circle
            key={i}
            cx={xScale(new Date(d.date))}
            cy={yScale(d.cumulative)}
            r={4}
            fill={theme.accent}
          />
        ))}
        <LinePath
          data={data}
          x={(d) => xScale(new Date(d.date))}
          y={(d) => yScale(d.cumulative)}
          stroke={theme.accent}
          strokeWidth={2}
          curve={curveMonotoneX}
        />
        <AxisBottom top={H - MARGIN.bottom} scale={xScale} />
        <AxisLeft scale={yScale} />
      </svg>
    </div>
  );
});
