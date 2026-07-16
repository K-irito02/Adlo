import type {
  AgentRunDetail,
  AgentStepType,
  ConversationSendResult,
  IpcResult,
  RiskLevel,
} from '@ai-digital-life/kernel';

export type { AgentRunDetail, AgentStepType, ConversationSendResult, IpcResult, RiskLevel };

/**
 * Agent 配置 (镜像 Rust AgentConfig 结构体)
 * 用于: 描述内置/自定义 Agent 的元信息与能力边界
 * Rust 端已启用 rename_all = "camelCase", 字段为 camelCase
 */
export interface AgentConfig {
  id: 'build' | 'plan' | 'general' | 'explore' | 'compaction' | 'title' | 'summary' | 'custom';
  name: string;
  description: string;
  mode: 'primary' | 'subagent' | 'hidden';
  hidden: boolean;
  allowsWriteTools: boolean;
  promptTemplate: string;
  modelOverride: string | null;
  allowedTools: string[];
}

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
  /**
   * 列出可用的内置 primary agents
   * @returns Agent 配置列表
   * @command list_agents
   * @see tauri-bridge.ts → agent.listAgents
   * @see mock-bridge.ts → agent.listAgents
   * @see preview-bridge/index.ts → agent.listAgents
   */
  listAgents: () => Promise<IpcResult<AgentConfig[]>>;
  /**
   * 根据场景选择合适的 Agent
   * @param scenario 场景标识 (如 "chat"、"plan"、"code-edit")
   * @param userPrompt 用户提示词,用于辅助选择
   * @returns 匹配的 Agent 配置
   * @command select_agent
   * @see tauri-bridge.ts → agent.selectAgent
   * @see mock-bridge.ts → agent.selectAgent
   * @see preview-bridge/index.ts → agent.selectAgent
   */
  selectAgent: (scenario: string, userPrompt: string) => Promise<IpcResult<AgentConfig>>;
  /**
   * 进入工作区的 Plan Mode
   * @param workspaceId 工作区 ID
   * @param workspaceRoot 工作区根路径
   * @returns Plan 文档路径
   * @command enter_plan_mode
   * @see tauri-bridge.ts → agent.enterPlanMode
   * @see mock-bridge.ts → agent.enterPlanMode
   * @see preview-bridge/index.ts → agent.enterPlanMode
   */
  enterPlanMode: (workspaceId: string, workspaceRoot: string) => Promise<IpcResult<string>>;
  /**
   * 退出工作区的 Plan Mode
   * @param workspaceId 工作区 ID
   * @returns Plan 文档路径 (退出时若已存在则返回, 否则 null)
   * @command exit_plan_mode
   * @see tauri-bridge.ts → agent.exitPlanMode
   * @see mock-bridge.ts → agent.exitPlanMode
   * @see preview-bridge/index.ts → agent.exitPlanMode
   */
  exitPlanMode: (workspaceId: string) => Promise<IpcResult<string | null>>;
  /**
   * 查询工作区是否处于 Plan Mode
   * @param workspaceId 工作区 ID
   * @returns true 表示处于 Plan Mode
   * @command get_plan_mode_state
   * @see tauri-bridge.ts → agent.getPlanModeState
   * @see mock-bridge.ts → agent.getPlanModeState
   * @see preview-bridge/index.ts → agent.getPlanModeState
   */
  getPlanModeState: (workspaceId: string) => Promise<IpcResult<boolean>>;
}
