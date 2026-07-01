import type { AgentRunDetail, ConversationSendResult, IpcResult } from '@ai-digital-life/kernel';

/**
 * Agent 运行控制桥接能力
 * 用于: 启动/获取/重试/中止 Agent 运行
 * Tauri 命令: agent_* 系列
 * 浏览器模式: 前端本地模拟运行
 */
export interface AgentBridge {
  /**
   * 启动 Agent 运行
   * @param input 会话 ID、用户提示词、场景 (chat/plan/code-edit)
   * @returns 运行启动结果 (含 runId)
   * @command agent_start_run
   * @see tauri-bridge.ts → agent.startRun
   * @see mock-bridge.ts → agent.startRun
   * @see preview-bridge/index.ts → agent.startRun
   */
  startRun: (input: {
    sessionId: string;
    prompt: string;
    scenario?: 'chat' | 'plan' | 'code-edit';
  }) => Promise<IpcResult<ConversationSendResult>>;
  /**
   * 获取 Agent 运行详情
   * @param runId Agent 运行 ID
   * @returns 运行详情或 undefined (未找到)
   * @command agent_get_run
   * @see tauri-bridge.ts → agent.getRun
   * @see mock-bridge.ts → agent.getRun
   * @see preview-bridge/index.ts → agent.getRun
   */
  getRun: (runId: string) => Promise<IpcResult<AgentRunDetail | undefined>>;
  /**
   * 重试失败或取消的 Agent 运行
   * @param runId Agent 运行 ID
   * @returns 重试后的运行详情或 undefined
   * @command agent_retry_run
   * @see tauri-bridge.ts → agent.retryRun
   * @see mock-bridge.ts → agent.retryRun
   * @see preview-bridge/index.ts → agent.retryRun
   */
  retryRun: (runId: string) => Promise<IpcResult<AgentRunDetail | undefined>>;
  /**
   * 中止正在进行的 Agent 运行
   * @param runId Agent 运行 ID
   * @returns 中止后的运行详情或 undefined
   * @command agent_abort_run
   * @see tauri-bridge.ts → agent.abortRun
   * @see mock-bridge.ts → agent.abortRun
   * @see preview-bridge/index.ts → agent.abortRun
   */
  abortRun: (runId: string) => Promise<IpcResult<AgentRunDetail | undefined>>;
}
