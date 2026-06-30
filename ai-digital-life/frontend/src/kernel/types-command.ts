import type { RiskLevel, ApprovalRequestSummary } from './types-task';

// ════════════════════════════════════════════════════════
// Command Types
// ════════════════════════════════════════════════════════

export type CommandProfile = 'build' | 'test' | 'lint' | 'install' | 'custom';

export interface CommandRequest {
  id: string;
  workspaceId: string;
  runId?: string;
  profile: CommandProfile;
  command: string;
  args: string[];
  shell: boolean;
  riskLevel: RiskLevel;
  createdAt: number;
}

export interface CommandExecutionResult {
  request: CommandRequest;
  exitCode: number | null;
  signal?: string;
  stdout: string;
  stderr: string;
  summary: string;
  success: boolean;
  startedAt: number;
  completedAt: number;
}

export interface CommandRunResult {
  status: 'completed' | 'waiting-approval';
  taskId: string;
  request: CommandRequest;
  result?: CommandExecutionResult;
  approvalRequest?: ApprovalRequestSummary;
}

/** Main → Renderer: versioned terminal stream (no env vars or secrets). */
export type DigitalLifeTerminalStreamEventV1 =
  | { v: 1; executionId: string; seq: number; type: 'stdout'; text: string }
  | { v: 1; executionId: string; seq: number; type: 'stderr'; text: string }
  | {
      v: 1;
      executionId: string;
      seq: number;
      type: 'done';
      exitCode: number | null;
      success: boolean;
      summary: string;
      signal?: string;
    }
  | { v: 1; executionId: string; seq: number; type: 'error'; message: string };

/** Result of starting a governed terminal stream (approval gate same as `command:run`). */
export type CommandRunStreamStart =
  | {
      mode: 'waiting-approval';
      taskId: string;
      request: CommandRequest;
      approvalRequest: ApprovalRequestSummary;
    }
  | { mode: 'started'; executionId: string; taskId: string; request: CommandRequest };
