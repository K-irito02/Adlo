import type {
  AgentBridge,
  SubagentBridge,
  AgentConfig,
  SubagentTask,
  TaskToolInput,
  TaskToolOutput,
} from '../shared/ipc';
import type { AgentRunDetail, ConversationSendResult } from '@ai-digital-life/kernel';
import { invokeIpc } from './shared';

export function createTauriAgentBridge(): AgentBridge {
  return {
    startRun: (input: {
      sessionId: string;
      prompt: string;
      scenario?: 'chat' | 'plan' | 'code-edit';
    }) => invokeIpc<ConversationSendResult>('agent_start_run', { input }),
    getRun: (runId: string) => invokeIpc<AgentRunDetail | undefined>('agent_get_run', { runId }),
    retryRun: (runId: string) =>
      invokeIpc<AgentRunDetail | undefined>('agent_retry_run', { runId }),
    abortRun: (runId: string) =>
      invokeIpc<AgentRunDetail | undefined>('agent_abort_run', { runId }),
    listAgents: () => invokeIpc<AgentConfig[]>('list_agents'),
    selectAgent: (scenario: string, userPrompt: string) =>
      invokeIpc<AgentConfig>('select_agent', { scenario, userPrompt }),
    enterPlanMode: (workspaceId: string, workspaceRoot: string) =>
      invokeIpc<string>('enter_plan_mode', { workspaceId, workspaceRoot }),
    exitPlanMode: (workspaceId: string) =>
      invokeIpc<string | null>('exit_plan_mode', { workspaceId }),
    getPlanModeState: (workspaceId: string) =>
      invokeIpc<boolean>('get_plan_mode_state', { workspaceId }),
  };
}

export function createTauriSubagentBridge(): SubagentBridge {
  return {
    spawnSubagent: (parentSessionId: string, input: TaskToolInput) =>
      invokeIpc<TaskToolOutput>('spawn_subagent', { parentSessionId, input }),
    getSubagentTask: (taskId: string) =>
      invokeIpc<SubagentTask | null>('get_subagent_task', { taskId }),
    listActiveSubagents: (workspaceId: string) =>
      invokeIpc<SubagentTask[]>('list_active_subagents', { workspaceId }),
    cancelSubagent: (taskId: string) => invokeIpc<boolean>('cancel_subagent', { taskId }),
  };
}
