import type { DigitalLifeRunActivityEventV1, IpcResult } from '@ai-digital-life/kernel';

export type { DigitalLifeRunActivityEventV1, IpcResult };

/**
 * Agent 运行活动日志桥接能力
 * 用于: 查询指定 Agent run 的活动日志流
 * Tauri 命令: run_activity_list_by_run_id
 * 浏览器模式: 前端本地模拟或空数据
 */
export interface RunActivityBridge {
  /**
   * 获取指定 Agent run 的活动事件日志
   * @param runId Agent 运行 ID
   * @param limit 返回结果数量上限 (可选)
   * @returns 按时间排序的运行活动事件列表
   * @command run_activity_list_by_run_id
   * @see tauri-bridge.ts → runActivity.listByRunId
   * @see mock-bridge.ts → runActivity.listByRunId
   * @see preview-bridge/index.ts → runActivity.listByRunId
   */
  listByRunId: (
    runId: string,
    limit?: number,
  ) => Promise<IpcResult<DigitalLifeRunActivityEventV1[]>>;
}
