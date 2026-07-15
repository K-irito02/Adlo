import React, { useMemo } from 'react';
import { AreaClosed, LinePath } from '@visx/shape';
import { scaleLinear } from '@visx/scale';
import { AxisBottom } from '@visx/axis';
import { GradientTealBlue } from '@visx/gradient';
import { useBklitTheme } from '../hooks/useBklitTheme';
import { generateCodeLineEvolutionData, toBklitAreaData } from '../data/gitVisMockData';

const WIDTH = 600;
const HEIGHT = 300;
const MARGIN = { top: 20, right: 20, bottom: 40, left: 60 };

export const CodeLineEvo = React.memo(function CodeLineEvo() {
  const theme = useBklitTheme();
  const data = useMemo(() => toBklitAreaData(generateCodeLineEvolutionData()), []);

  const xScale = useMemo(
    () => scaleLinear({ domain: [0, data.length - 1], range: [MARGIN.left, WIDTH - MARGIN.right] }),
    [data]
  );
  const yMax =
    data.length > 0 ? Math.max(...data.map((d) => Math.max(d.added, d.deleted))) * 1.1 : 1;
  const yScale = useMemo(
    () => scaleLinear({ domain: [0, yMax], range: [HEIGHT - MARGIN.bottom, MARGIN.top] }),
    [yMax]
  );

  return (
    <div className="adl-git-vis__chart">
      <svg width="100%" height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
        <GradientTealBlue id="area-gradient" />
        <AreaClosed
          data={data}
          x={(d, i) => xScale(i)}
          y={(d) => yScale(d.added)}
          yScale={yScale}
          fill="url(#area-gradient)"
        />
        <LinePath
          data={data}
          x={(d, i) => xScale(i)}
          y={(d) => yScale(d.deleted)}
          stroke={theme.seriesColors[1]}
          strokeWidth={2}
        />
        <AxisBottom
          top={HEIGHT - MARGIN.bottom}
          scale={xScale}
          tickFormat={(val) => data[Math.round(Number(val))]?.date ?? ''}
        />
      </svg>
    </div>
  );
});
