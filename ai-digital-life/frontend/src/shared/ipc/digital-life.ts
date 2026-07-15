import type {
  DigitalLifeModelStreamEventV1,
  DigitalLifeRunActivityEventV1,
  DigitalLifeTerminalStreamEventV1,
} from '@ai-digital-life/kernel';

export type {
  DigitalLifeModelStreamEventV1,
  DigitalLifeRunActivityEventV1,
  DigitalLifeTerminalStreamEventV1,
};

import type { PtyOutputEvent } from './pty';
import type { WindowBridge } from './window';
import type { AppBridge } from './app';
import type { WorkspaceBridge } from './workspace';
import type { RetrievalBridge } from './retrieval';
import type { ConversationBridge } from './conversation';
import type { AgentBridge } from './agent';
import type { SubagentBridge } from './subagent';
import type { PatchBridge } from './patch';
import type { CommandBridge } from './command';
import type { PtyBridge } from './pty';
import type { TaskBridge } from './task';
import type { RunActivityBridge } from './run-activity';
import type { BrowserBridge } from './browser';
import type { GitHubBridge } from './github';
import type { McpBridge } from './mcp';
import type { ProviderBridge } from './provider';
import type { SnapshotBridge } from './snapshot';
import type { WebToolsBridge } from './web_tools';
import type { CommandsConfigBridge } from './commands_config';
import type { PermissionBridge } from './permission';
import type { CompactionBridge } from './compaction';
import type { SessionForkBridge } from './session_fork';
import type { LspBridge } from './lsp';
import type { ReferenceBridge } from './reference';
import type { CustomAgentBridge } from './custom_agent';
import type { DurableBridge } from './durable';
import type { ReservedBridge } from './reserved';

/**
 * Digital Life 全局桥接接口 - 汇总所有子能力
 * 用于: 作为 window.digitalLife 的类型, 提供事件订阅与各子模块访问入口
 * 实现: tauri-bridge.ts (Tauri 应用), mock-bridge.ts (浏览器 mock), preview-bridge (预览模式)
 */
export interface DigitalLifeBridge {
  /**
   * 订阅模型输出流事件
   * @param listener 接收模型流式事件 (token/event) 的回调
   * @returns 取消订阅的函数
   * @command 无独立命令 (通过事件 channel: digital-life://model-stream)
   * @see tauri-bridge.ts → subscribeModelStream
   * @see mock-bridge.ts → subscribeModelStream
   * @see preview-bridge/index.ts → subscribeModelStream
   */
  subscribeModelStream: (listener: (event: DigitalLifeModelStreamEventV1) => void) => () => void;
  /**
   * 订阅 Agent 运行活动流事件
   * @param listener 接收运行活动事件的回调
   * @returns 取消订阅的函数
   * @command 无独立命令 (通过事件 channel: digital-life://run-activity)
   * @see tauri-bridge.ts → subscribeRunActivity
   * @see mock-bridge.ts → subscribeRunActivity
   * @see preview-bridge/index.ts → subscribeRunActivity
   */
  subscribeRunActivity: (listener: (event: DigitalLifeRunActivityEventV1) => void) => () => void;
  /**
   * 订阅终端输出流事件
   * @param listener 接收终端流式事件的回调
   * @returns 取消订阅的函数
   * @command 无独立命令 (通过事件 channel: digital-life://terminal-stream)
   * @see tauri-bridge.ts → subscribeTerminalStream
   * @see mock-bridge.ts → subscribeTerminalStream
   * @see preview-bridge/index.ts → subscribeTerminalStream
   */
  subscribeTerminalStream: (
    listener: (event: DigitalLifeTerminalStreamEventV1) => void
  ) => () => void;
  /**
   * 订阅 PTY 终端输出事件
   * @param listener 接收 PTY 输出事件的回调
   * @returns 取消订阅的函数
   * @command 无独立命令 (通过事件 channel: digital-life://pty-output)
   * @see tauri-bridge.ts → subscribePtyOutput
   * @see mock-bridge.ts → subscribePtyOutput
   * @see preview-bridge/index.ts → subscribePtyOutput
   */
  subscribePtyOutput: (listener: (event: PtyOutputEvent) => void) => () => void;
  /**
   * 设置日志模式
   * @param target 'terminal' | 'debug'
   * @param mode 'overwrite' | 'append' | 'multi'
   * @command app_set_log_mode
   * @see tauri-bridge.ts → setLogMode
   * @see mock-bridge.ts → setLogMode
   * @see preview-bridge/index.ts → setLogMode
   */
  setLogMode: (
    target: 'terminal' | 'debug',
    mode: 'overwrite' | 'append' | 'multi'
  ) => Promise<void>;
  /** 窗口控制子模块 */
  window: WindowBridge;
  /** 应用信息与健康状态子模块 */
  app: AppBridge;
  /** 工作区管理子模块 */
  workspace: WorkspaceBridge;
  /** 内容索引与检索子模块 */
  retrieval: RetrievalBridge;
  /** 对话会话管理子模块 */
  conversation: ConversationBridge;
  /** Agent 运行控制子模块 */
  agent: AgentBridge;
  /** 子代理 (Sub-agent) 管理子模块 */
  subagent: SubagentBridge;
  /** MCP 服务器管理子模块 */
  mcp: McpBridge;
  /** 补丁管理子模块 */
  patch: PatchBridge;
  /** Provider API 密钥管理子模块 */
  provider: ProviderBridge;
  /** 命令执行子模块 */
  command: CommandBridge;
  /** PTY 终端子模块 */
  pty: PtyBridge;
  /** 任务中心与审批子模块 */
  task: TaskBridge;
  /** 运行活动日志子模块 */
  runActivity: RunActivityBridge;
  /** 浏览器预览子模块 */
  browser: BrowserBridge;
  /** GitHub 集成子模块 (与 ci 共用同一接口) */
  github: GitHubBridge;
  /** CI 状态子模块 (与 github 共用同一接口) */
  ci: GitHubBridge;
  /** 快照管理子模块 */
  snapshot: SnapshotBridge;
  /** Web 工具子模块 (网页抓取/搜索) */
  webTools: WebToolsBridge;
  /** 自定义命令管理子模块 */
  commandsConfig: CommandsConfigBridge;
  /** 权限规则管理子模块 */
  permission: PermissionBridge;
  /** 会话压缩管理子模块 */
  compaction: CompactionBridge;
  /** 会话分叉管理子模块 */
  sessionFork: SessionForkBridge;
  /** 语言服务器 (LSP) 子模块 */
  lsp: LspBridge;
  /** 参考代码仓库管理子模块 */
  reference: ReferenceBridge;
  /** 持久化会话管理子模块 */
  durable: DurableBridge;
  /** 预留功能 IPC 存根子模块 */
  reserved: ReservedBridge;
  /** 自定义 Agent 管理子模块 */
  customAgent: CustomAgentBridge;
}
