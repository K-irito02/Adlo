import { useEffect, useRef } from 'react';
import type { EChartsOption } from '../echartsSetup';
import { init, type EChartsType } from '../echartsSetup';

/**
 * 管理 ECharts 实例生命周期：初始化、option 更新、resize 响应、卸载清理。
 * 返回一个挂载到图表容器的 ref。
 */
export function useECharts(option: EChartsOption) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | undefined>(undefined);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const chart = init(container);
    chartRef.current = chart;
    chart.setOption(option);

    const resizeObserver = new ResizeObserver(() => {
      chart.resize();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.dispose();
      chartRef.current = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: init chart + ResizeObserver once; option updates handled by the effect below
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, true);
  }, [option]);

  return containerRef;
}
