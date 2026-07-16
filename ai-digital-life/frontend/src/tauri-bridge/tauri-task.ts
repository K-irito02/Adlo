import type { TaskBridge } from '../shared/ipc';
import type {
  ApprovalRequestSummary,
  AuditEntry,
  CheckpointPayloadPreview,
  TaskCenterSnapshot,
} from '@ai-digital-life/kernel';
import { invokeIpc } from './tauri-shared';

export function createTauriTaskBridge(): TaskBridge {
  return {
    getSnapshot: () => invokeIpc<TaskCenterSnapshot>('task_get_snapshot'),
    listPendingApprovals: () => invokeIpc<ApprovalRequestSummary[]>('task_list_pending_approvals'),
    getCheckpointPreview: (checkpointId: string) =>
      invokeIpc<CheckpointPayloadPreview | undefined>('task_get_checkpoint_preview', {
        checkpointId,
      }),
    restoreCheckpoint: (checkpointId: string) =>
      invokeIpc<TaskCenterSnapshot>('task_restore_checkpoint', { checkpointId }),
    decideApproval: (input: {
      approvalId: string;
      decision: 'approved' | 'rejected';
      reason?: string;
    }) => invokeIpc<TaskCenterSnapshot>('task_decide_approval', { input }),
    listAuditEntries: (limit?: number) =>
      invokeIpc<AuditEntry[]>('task_list_audit_entries', { limit }),
  };
}
