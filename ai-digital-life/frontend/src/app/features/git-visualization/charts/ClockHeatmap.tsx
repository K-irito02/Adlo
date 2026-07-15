import React, { useMemo } from 'react';
import { scaleLinear } from '@visx/scale';
import { useBklitTheme } from '../hooks/useBklitTheme';
import { toClockHeatmapData } from '../data/gitVisMockData';

const W = 600;
const H = 300;
const CELL_W = 25;
const CELL_H = 25;
const PAD = 40;

export const ClockHeatmap = React.memo(function ClockHeatmap() {
  const theme = useBklitTheme();
  const data = useMemo(() => toClockHeatmapData(), []);
  const maxVal = Math.max(...data.map((d) => d.value));
  const colorScale = useMemo(
    () =>
      scaleLinear<string>({
        domain: [0, maxVal],
        range: [theme.heatmapColors[0], theme.heatmapColors[theme.heatmapColors.length - 1]],
      }),
    [maxVal, theme]
  );

  return (
    <div className="adl-git-vis__chart">
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        {data.map((d, i) => (
          <rect
            key={i}
            x={PAD + d.x * CELL_W}
            y={PAD + d.y * CELL_H}
            width={CELL_W - 2}
            height={CELL_H - 2}
            rx={3}
            fill={colorScale(d.value)}
          />
        ))}
      </svg>
    </div>
  );
});
