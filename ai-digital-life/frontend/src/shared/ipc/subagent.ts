import type { IpcResult } from '@ai-digital-life/kernel';

/**
 * Task Tool 输入 (镜像 Rust TaskToolInput)
 * 用于: 派生子代理执行后台任务
 * 注意: Rust 端未启用 rename_all = "camelCase", 字段保持 snake_case
 */
export interface TaskToolInput {
  description: string;
  prompt: string;
  subagent_type: string;
  task_id: string | null;
  background: boolean;
}

/**
 * Task Tool 输出 (镜像 Rust TaskToolOutput)
 * 用于: 子代理任务派生后的即时返回值
 */
export interface TaskToolOutput {
  task_id: string;
  state: 'running' | 'completed' | 'error';
  summary: string;
  result: string | null;
  error: string | null;
}

/**
 * 子代理任务记录 (镜像 Rust SubagentTask)
 * 用于: 查询子代理任务的详细状态
 */
export interface SubagentTask {
  id: string;
  parent_session_id: string;
  child_session_id: string;
  subagent_type: string;
  prompt: string;
  background: boolean;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'aborted';
  created_at: number;
  completed_at: number | null;
}

/**
 * 子代理 (Sub-agent) 管理桥接能力
 * 用于: 派生/查询/列出/取消子代理任务
 * Tauri 命令: spawn_subagent / get_subagent_task / list_active_subagents / cancel_subagent
 * 浏览器模式: 前端本地模拟运行
 */
export interface SubagentBridge {
  /**
   * 派生一个子代理任务
   * @param input 任务描述、提示词、子代理类型等
   * @returns 任务 ID 与初始状态
   * @command spawn_subagent
   * @see tauri-bridge.ts → subagent.spawnSubagent
   * @see mock-bridge.ts → subagent.spawnSubagent
   * @see preview-bridge/index.ts → subagent.spawnSubagent
   */
  spawnSubagent: (input: TaskToolInput) => Promise<IpcResult<TaskToolOutput>>;
  /**
   * 查询子代理任务详情
   * @param taskId 任务 ID
   * @returns 子代理任务记录或 null (未找到)
   * @command get_subagent_task
   * @see tauri-bridge.ts → subagent.getSubagentTask
   * @see mock-bridge.ts → subagent.getSubagentTask
   * @see preview-bridge/index.ts → subagent.getSubagentTask
   */
  getSubagentTask: (taskId: string) => Promise<IpcResult<SubagentTask | null>>;
  /**
   * 列出工作区内活跃的子代理任务
   * @param workspaceId 工作区 ID
   * @returns 子代理任务列表
   * @command list_active_subagents
   * @see tauri-bridge.ts → subagent.listActiveSubagents
   * @see mock-bridge.ts → subagent.listActiveSubagents
   * @see preview-bridge/index.ts → subagent.listActiveSubagents
   */
  listActiveSubagents: (workspaceId: string) => Promise<IpcResult<SubagentTask[]>>;
  /**
   * 取消子代理任务
   * @param taskId 任务 ID
   * @returns true 表示取消成功
   * @command cancel_subagent
   * @see tauri-bridge.ts → subagent.cancelSubagent
   * @see mock-bridge.ts → subagent.cancelSubagent
   * @see preview-bridge/index.ts → subagent.cancelSubagent
   */
  cancelSubagent: (taskId: string) => Promise<IpcResult<boolean>>;
}
