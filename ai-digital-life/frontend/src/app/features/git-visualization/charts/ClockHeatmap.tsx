import React, { useCallback, useMemo, useState } from 'react';
import { scaleLinear } from '@visx/scale';
import { useTCopy } from '@i18n/useTCopy';
import { useBklitTheme } from '../hooks/useBklitTheme';
import { toClockHeatmapData } from '../data/gitVisMockData';

const W = 640;
const H = 260;
const CELL_W = 24;
const CELL_H = 24;
const PAD = 50;
const HOUR_LABELS = [
  '0',
  '',
  '2',
  '',
  '4',
  '',
  '6',
  '',
  '8',
  '',
  '10',
  '',
  '12',
  '',
  '14',
  '',
  '16',
  '',
  '18',
  '',
  '20',
  '',
  '22',
  '',
];

export const ClockHeatmap = React.memo(function ClockHeatmap() {
  const { t } = useTCopy();
  const theme = useBklitTheme();
  const data = useMemo(() => toClockHeatmapData(), []);
  const maxVal = data.length > 0 ? Math.max(...data.map((d) => d.value)) : 1;
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  const dayLabels = useMemo(() => {
    const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
    return Array.from({ length: 7 }, (_, i) => dayFmt.format(new Date(2026, 0, 4 + i)));
  }, []);

  const colorScale = useMemo(
    () =>
      scaleLinear<string>({
        domain: [0, maxVal],
        range: [theme.heatmapColors[0], theme.heatmapColors[theme.heatmapColors.length - 1]],
      }),
    [maxVal, theme]
  );

  const handleEnter = useCallback(
    (e: React.MouseEvent<SVGRectElement>, val: number, hour: number, day: number) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const parent = e.currentTarget.closest('.adl-git-vis__chart')?.getBoundingClientRect();
      if (!parent) {
        return;
      }
      setTooltip({
        x: rect.left - parent.left + rect.width / 2,
        y: rect.top - parent.top - 8,
        text: `${dayLabels[day]} ${hour}:00 – ${val} ${t.gitVisCommits}`,
      });
    },
    [dayLabels, t]
  );
  const handleLeave = useCallback(() => setTooltip(null), []);

  return (
    <div className="adl-git-vis__chart" style={{ position: 'relative' }}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        {/* Hour labels */}
        {HOUR_LABELS.map((label, i) =>
          label ? (
            <text
              key={i}
              x={PAD + i * CELL_W + CELL_W / 2}
              y={PAD - 8}
              fontSize={9}
              fill={theme.muted}
              textAnchor="middle"
              fontFamily="inherit"
            >
              {label}
            </text>
          ) : null
        )}
        {/* Day labels */}
        {dayLabels.map((label, i) => (
          <text
            key={i}
            x={PAD - 8}
            y={PAD + (i + 0.7) * CELL_H}
            fontSize={9}
            fill={theme.muted}
            textAnchor="end"
            fontFamily="inherit"
          >
            {label}
          </text>
        ))}
        {data.map((d, i) => (
          <rect
            key={i}
            x={PAD + d.x * CELL_W}
            y={PAD + d.y * CELL_H}
            width={CELL_W - 1}
            height={CELL_H - 1}
            rx={3}
            fill={colorScale(d.value)}
            style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
            onMouseEnter={(e) => handleEnter(e, d.value, d.x, d.y)}
            onMouseLeave={handleLeave}
          />
        ))}
      </svg>
      {tooltip && (
        <div
          style={{
            position: 'absolute',
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translateX(-50%) translateY(-100%)',
            background: theme.tooltipBg,
            color: theme.tooltipText,
            padding: '4px 8px',
            borderRadius: 4,
            fontSize: 11,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
});
