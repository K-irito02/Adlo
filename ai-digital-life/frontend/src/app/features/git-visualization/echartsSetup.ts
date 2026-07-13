import { use, init } from 'echarts/core';
import {
  GraphChart,
  HeatmapChart,
  BarChart,
  LineChart,
  TreemapChart,
  SankeyChart,
} from 'echarts/charts';
import {
  CalendarComponent,
  VisualMapComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

// eslint-disable-next-line react-hooks/rules-of-hooks
use([
  GraphChart,
  HeatmapChart,
  BarChart,
  LineChart,
  TreemapChart,
  SankeyChart,
  CalendarComponent,
  VisualMapComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  CanvasRenderer,
]);

export { use, init };
export { graphic } from 'echarts/core';
export type { EChartsType } from 'echarts/core';
export type { EChartsOption } from 'echarts/types/dist/shared';
