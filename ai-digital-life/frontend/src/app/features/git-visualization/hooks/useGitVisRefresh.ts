import { useCallback } from 'react';

/**
 * Git 可视化数据刷新 hook。
 *
 * 当前为前端 stub 实现（Promise.resolve + 模拟延迟），仅预留接口以供后续接入真实后端。
 *
 * ## 后续接入真实后端指引
 *
 * ### refreshWorkspace()
 * - 目标：刷新"当前选中工作区"的所有可视化图表数据
 * - 建议 API: GET /api/git-visualization/workspace/:workspaceId
 * - 返回数据结构：包含所有图表数据的对象，更新到 store 或本地状态
 * - 可添加 loading/error 状态管理
 *
 * ### refreshChart(chartId)
 * - 目标：刷新"当前选中工作区"的单个可视化图表数据
 * - 建议 API: GET /api/git-visualization/workspace/:workspaceId/chart/:chartId
 * - chartId 枚举值：'branch-graph' | 'code-line-evolution' | 'commit-timeline' | 'file-sunburst' | 'heatmap'
 * - 注意：热力聚合图（HeatmapCardGroup）作为单个图表处理，内部四个子标签由前端切换，不由后端区分
 *
 * @param workspaceId - 当前选中的工作区 ID
 * @returns 刷新控制方法
 */
export function useGitVisRefresh(_workspaceId: string) {
  // 此处 _workspaceId 暂时未使用（仅作参数预留），接入真实后端后将用于构造 API 请求路径

  /**
   * 刷新当前工作区的所有可视化图表。
   * 点击 WorkspaceTabBar 中的"刷新"按钮时触发。
   */
  const refreshWorkspace = useCallback(async () => {
    // TODO: 接入真实后端时替换为实际 API 调用，届时将使用 _workspaceId 构造请求路径
    // const response = await fetch(`/api/git-visualization/workspace/${_workspaceId}`);
    // const data = await response.json();
    // 将 data 写入 store 或本地状态，触发各图表重新渲染
    await new Promise((resolve) => setTimeout(resolve, 300));
  }, []);

  /**
   * 刷新当前工作区的单个图表。
   * 点击各 ChartCard 标题左侧的"刷新"按钮时触发。
   *
   * @param chartId - 图表标识符
   */
  const refreshChart = useCallback(async (_chartId: string) => {
    // TODO: 接入真实后端时替换为实际 API 调用，届时将使用 _workspaceId 构造请求路径
    // const response = await fetch(
    //   `/api/git-visualization/workspace/${_workspaceId}/chart/${_chartId}`,
    // );
    // const data = await response.json();
    // 将该图表的数据写入 store，触发该图表重新渲染
    await new Promise((resolve) => setTimeout(resolve, 200));
  }, []);

  return { refreshWorkspace, refreshChart } as const;
}
