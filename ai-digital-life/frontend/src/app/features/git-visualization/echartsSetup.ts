import * as echarts from 'echarts/core';
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

echarts.use([
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

export { echarts };
export { graphic } from 'echarts/core';
export type { EChartsType } from 'echarts/core';
export type { EChartsOption } from 'echarts/types/dist/shared';
