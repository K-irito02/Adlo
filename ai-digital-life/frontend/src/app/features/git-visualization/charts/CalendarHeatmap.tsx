import React, { useMemo } from 'react';
import { scaleLinear } from '@visx/scale';
import { useBklitTheme } from '../hooks/useBklitTheme';
import { toCalendarHeatmapData } from '../data/gitVisMockData';

const W = 900;
const H = 600;
const CELL_W = 10;
const CELL_H = 10;
const PAD = 40;
const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

export const CalendarHeatmap = React.memo(function CalendarHeatmap() {
  const theme = useBklitTheme();
  const data = useMemo(() => toCalendarHeatmapData(), []);
  const maxVal = data.length > 0 ? Math.max(...data.map((d) => d.value)) : 1;
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
        {DAY_LABELS.map((label, i) =>
          label ? (
            <text key={i} x={0} y={PAD + (i + 0.8) * CELL_H} fontSize={8} fill={theme.muted}>
              {label}
            </text>
          ) : null
        )}
        {data.map((d, i) => (
          <rect
            key={i}
            x={PAD + d.x * CELL_W}
            y={PAD + d.y * CELL_H}
            width={CELL_W - 2}
            height={CELL_H - 2}
            rx={2}
            fill={colorScale(d.value)}
          />
        ))}
      </svg>
    </div>
  );
});
