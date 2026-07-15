import type {
  AgentRunDetail,
  CommandOutputConversationBlock,
  ConversationBlock,
  ConversationDetail,
  ConversationSendResult,
  ConversationSessionRecord,
  ExecutionStepConversationBlock,
  ExecutionSummaryConversationBlock,
  FinalSummaryConversationBlock,
  IpcResult,
  MarkdownConversationBlock,
  ModelTokenUsage,
  PatchSummaryConversationBlock,
  PlanConversationBlock,
  ReorderSessionsInput,
  ToolCallConversationBlock,
  ValidationResultConversationBlock,
} from '@ai-digital-life/kernel';

export type {
  AgentRunDetail,
  CommandOutputConversationBlock,
  ConversationBlock,
  ConversationDetail,
  ConversationSendResult,
  ConversationSessionRecord,
  ExecutionStepConversationBlock,
  ExecutionSummaryConversationBlock,
  FinalSummaryConversationBlock,
  IpcResult,
  MarkdownConversationBlock,
  ModelTokenUsage,
  PatchSummaryConversationBlock,
  PlanConversationBlock,
  ReorderSessionsInput,
  ToolCallConversationBlock,
  ValidationResultConversationBlock,
};

/**
 * 对话会话管理桥接能力
 * 用于: 创建/列出/获取/重命名/置顶/归档/删除会话、发送消息、取消消息
 * Tauri 命令: conversation_* 系列
 * 浏览器模式: 前端本地存储 mock 数据
 */
export interface ConversationBridge {
  /**
   * 创建新对话会话
   * @param title 会话标题 (可选)
   * @param workspaceId 关联工作区 ID (可选)
   * @returns 新建会话的记录
   * @command conversation_create_session
   * @see tauri-bridge.ts → conversation.createSession
   * @see mock-bridge.ts → conversation.createSession
   * @see preview-bridge/index.ts → conversation.createSession
   */
  createSession: (
    title?: string,
    workspaceId?: string
  ) => Promise<IpcResult<ConversationSessionRecord>>;
  /**
   * 列出所有对话会话
   * @returns 会话记录列表
   * @command conversation_list_sessions
   * @see tauri-bridge.ts → conversation.listSessions
   * @see mock-bridge.ts → conversation.listSessions
   * @see preview-bridge/index.ts → conversation.listSessions
   */
  listSessions: () => Promise<IpcResult<ConversationSessionRecord[]>>;
  /**
   * 获取单个会话的详细信息 (含消息)
   * @param sessionId 会话 ID
   * @returns 会话详情或 undefined (未找到)
   * @command conversation_get_session
   * @see tauri-bridge.ts → conversation.getSession
   * @see mock-bridge.ts → conversation.getSession
   * @see preview-bridge/index.ts → conversation.getSession
   */
  getSession: (sessionId: string) => Promise<IpcResult<ConversationDetail | undefined>>;
  /**
   * 重命名会话
   * @param input 包含会话 ID 和新标题
   * @returns 更新后的会话记录
   * @command conversation_rename_session
   * @see tauri-bridge.ts → conversation.renameSession
   * @see mock-bridge.ts → conversation.renameSession
   * @see preview-bridge/index.ts → conversation.renameSession
   */
  renameSession: (input: {
    sessionId: string;
    title: string;
  }) => Promise<IpcResult<ConversationSessionRecord>>;
  /**
   * 置顶会话
   * @param sessionId 会话 ID
   * @returns 更新后的会话记录
   * @command conversation_pin_session
   * @see tauri-bridge.ts → conversation.pinSession
   * @see mock-bridge.ts → conversation.pinSession
   * @see preview-bridge/index.ts → conversation.pinSession
   */
  pinSession: (sessionId: string) => Promise<IpcResult<ConversationSessionRecord>>;
  /**
   * 取消置顶会话
   * @param sessionId 会话 ID
   * @returns 更新后的会话记录
   * @command conversation_unpin_session
   * @see tauri-bridge.ts → conversation.unpinSession
   * @see mock-bridge.ts → conversation.unpinSession
   * @see preview-bridge/index.ts → conversation.unpinSession
   */
  unpinSession: (sessionId: string) => Promise<IpcResult<ConversationSessionRecord>>;
  /**
   * 对会话列表进行重排序
   * @param input 置顶/非置顶会话的 ID 顺序数组
   * @returns 重排序后的会话列表
   * @command conversation_reorder_sessions
   * @see tauri-bridge.ts → conversation.reorderSessions
   * @see mock-bridge.ts → conversation.reorderSessions
   * @see preview-bridge/index.ts → conversation.reorderSessions
   */
  reorderSessions: (input: ReorderSessionsInput) => Promise<IpcResult<ConversationSessionRecord[]>>;
  /**
   * 标记会话为已读
   * @param input 会话 ID 和可选读取时间戳
   * @returns 更新后的会话记录
   * @command conversation_mark_session_read
   * @see tauri-bridge.ts → conversation.markSessionRead
   * @see mock-bridge.ts → conversation.markSessionRead
   * @see preview-bridge/index.ts → conversation.markSessionRead
   */
  markSessionRead: (input: {
    sessionId: string;
    readAt?: number;
  }) => Promise<IpcResult<ConversationSessionRecord>>;
  /**
   * 标记会话为未读
   * @param sessionId 会话 ID
   * @returns 更新后的会话记录
   * @command conversation_mark_session_unread
   * @see tauri-bridge.ts → conversation.markSessionUnread
   * @see mock-bridge.ts → conversation.markSessionUnread
   * @see preview-bridge/index.ts → conversation.markSessionUnread
   */
  markSessionUnread: (sessionId: string) => Promise<IpcResult<ConversationSessionRecord>>;
  /**
   * 归档会话
   * @param sessionId 会话 ID
   * @returns 更新后的会话记录
   * @command conversation_archive_session
   * @see tauri-bridge.ts → conversation.archiveSession
   * @see mock-bridge.ts → conversation.archiveSession
   * @see preview-bridge/index.ts → conversation.archiveSession
   */
  archiveSession: (sessionId: string) => Promise<IpcResult<ConversationSessionRecord>>;
  /**
   * 归档当前工作区内所有会话
   * @returns 更新后的会话记录列表
   * @command conversation_archive_all_in_workspace
   * @see tauri-bridge.ts → conversation.archiveAllInWorkspace
   * @see mock-bridge.ts → conversation.archiveAllInWorkspace
   * @see preview-bridge/index.ts → conversation.archiveAllInWorkspace
   */
  archiveAllInWorkspace: () => Promise<IpcResult<ConversationSessionRecord[]>>;
  /**
   * 删除会话
   * @param sessionId 会话 ID
   * @returns 是否删除成功
   * @command conversation_delete_session
   * @see tauri-bridge.ts → conversation.deleteSession
   * @see mock-bridge.ts → conversation.deleteSession
   * @see preview-bridge/index.ts → conversation.deleteSession
   */
  deleteSession: (sessionId: string) => Promise<IpcResult<boolean>>;
  /**
   * 在会话中发送消息
   * @param input 会话 ID、消息内容、场景 (chat/plan/code-edit)
   * @returns 消息发送结果 (可能触发 Agent run)
   * @command conversation_send_message
   * @see tauri-bridge.ts → conversation.sendMessage
   * @see mock-bridge.ts → conversation.sendMessage
   * @see preview-bridge/index.ts → conversation.sendMessage
   */
  sendMessage: (input: {
    sessionId: string;
    content: string;
    scenario?: 'chat' | 'plan' | 'code-edit';
    providerId?: string;
    modelId?: string;
  }) => Promise<IpcResult<ConversationSendResult>>;
  /**
   * 取消正在处理的消息
   * @param runId Agent 运行 ID
   * @returns 取消后的 Agent 运行详情或 undefined
   * @command conversation_cancel_message
   * @see tauri-bridge.ts → conversation.cancelMessage
   * @see mock-bridge.ts → conversation.cancelMessage
   * @see preview-bridge/index.ts → conversation.cancelMessage
   */
  cancelMessage: (runId: string) => Promise<IpcResult<AgentRunDetail | undefined>>;
}
