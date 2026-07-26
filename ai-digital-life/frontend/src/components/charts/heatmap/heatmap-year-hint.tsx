'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useHeatmap } from './heatmap-context';

export const HeatmapYearHint = memo(function HeatmapYearHint() {
  const { data, margin, xScale, containerRef } = useHeatmap();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const yearTicks = useMemo(() => {
    const ticks: { year: number; x: number; key: string }[] = [];
    let lastYear: number | null = null;
    let firstYear: number | null = null;

    for (let i = 0; i < data.length; i++) {
      const column = data[i];
      const firstBin = column?.bins[0];
      if (!firstBin?.date) {
        continue;
      }
      const year = firstBin.date.getFullYear();
      if (firstYear === null) {
        firstYear = year;
      }
      if (year !== lastYear) {
        ticks.push({ year, x: margin.left + xScale(i), key: `year-${year}` });
        lastYear = year;
      }
    }

    if (firstYear !== null && lastYear !== null && firstYear === lastYear) {
      return [];
    }
    return ticks;
  }, [data, margin.left, xScale]);

  const container = containerRef.current;
  if (!(mounted && container)) {
    return null;
  }

  return createPortal(
    yearTicks.map((tick) => (
      <div className="pointer-events-none absolute" key={tick.key} style={{ top: 0, left: tick.x }}>
        <span className="text-chart-label text-xs whitespace-nowrap">{tick.year}</span>
      </div>
    )),
    container,
  );
});
