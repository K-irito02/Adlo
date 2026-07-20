import type {
  ApprovalRequestSummary,
  AuditEntry,
  CheckpointPayloadPreview,
  IpcResult,
  TaskCenterSnapshot,
} from '@ai-digital-life/kernel';

export type {
  ApprovalRequestSummary,
  AuditEntry,
  CheckpointPayloadPreview,
  IpcResult,
  TaskCenterSnapshot,
};

/**
 * 任务中心与审批管理桥接能力
 * 用于: 获取任务快照、列出待审批项、检查点预览/恢复、审批决策、审计日志
 * Tauri 命令: task_* 系列
 * 浏览器模式: 前端本地模拟
 */
export interface TaskBridge {
  /**
   * 获取当前任务中心快照
   * @returns 任务、审批项、检查点的完整快照
   * @command task_get_snapshot
   * @see tauri-bridge.ts → task.getSnapshot
   * @see mock-bridge.ts → task.getSnapshot
   * @see preview-bridge/index.ts → task.getSnapshot
   */
  getSnapshot: () => Promise<IpcResult<TaskCenterSnapshot>>;
  /**
   * 列出待审批请求
   * @returns 待审批请求摘要列表
   * @command task_list_pending_approvals
   * @see tauri-bridge.ts → task.listPendingApprovals
   * @see mock-bridge.ts → task.listPendingApprovals
   * @see preview-bridge/index.ts → task.listPendingApprovals
   */
  listPendingApprovals: () => Promise<IpcResult<ApprovalRequestSummary[]>>;
  /**
   * 获取检查点 payload 的预览内容
   * @param checkpointId 检查点 ID
   * @returns 检查点预览内容或 undefined (未找到)
   * @command task_get_checkpoint_preview
   * @see tauri-bridge.ts → task.getCheckpointPreview
   * @see mock-bridge.ts → task.getCheckpointPreview
   * @see preview-bridge/index.ts → task.getCheckpointPreview
   */
  getCheckpointPreview: (
    checkpointId: string,
  ) => Promise<IpcResult<CheckpointPayloadPreview | undefined>>;
  /**
   * 将工作区恢复到指定检查点状态
   * @param checkpointId 检查点 ID
   * @returns 恢复后的任务中心快照
   * @command task_restore_checkpoint
   * @see tauri-bridge.ts → task.restoreCheckpoint
   * @see mock-bridge.ts → task.restoreCheckpoint
   * @see preview-bridge/index.ts → task.restoreCheckpoint
   */
  restoreCheckpoint: (checkpointId: string) => Promise<IpcResult<TaskCenterSnapshot>>;
  /**
   * 对审批请求做出决策 (approved/rejected)
   * @param input 审批 ID、决策、可选原因
   * @returns 更新后的任务中心快照
   * @command task_decide_approval
   * @see tauri-bridge.ts → task.decideApproval
   * @see mock-bridge.ts → task.decideApproval
   * @see preview-bridge/index.ts → task.decideApproval
   */
  decideApproval: (input: {
    approvalId: string;
    decision: 'approved' | 'rejected';
    reason?: string;
  }) => Promise<IpcResult<TaskCenterSnapshot>>;
  /**
   * 列出审计日志条目
   * @param limit 返回结果数量上限 (可选)
   * @returns 审计日志条目列表 (按时间倒序)
   * @command task_list_audit_entries
   * @see tauri-bridge.ts → task.listAuditEntries
   * @see mock-bridge.ts → task.listAuditEntries
   * @see preview-bridge/index.ts → task.listAuditEntries
   */
  listAuditEntries: (limit?: number) => Promise<IpcResult<AuditEntry[]>>;
}
