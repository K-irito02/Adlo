import type { AgentBridge, SubagentBridge } from "../shared/ipc";
import { activeRun } from "./shared";
import { mockConversation } from "./mock-conversation";

export const mockAgent: AgentBridge = {
  startRun: async ({ sessionId, prompt }) => {
    const result = await mockConversation.sendMessage({ sessionId, content: prompt });
    return result;
  },
  getRun: async (_runId: string) => ({ ok: true, data: activeRun }),
  retryRun: async (_runId: string) => ({ ok: true, data: activeRun }),
  abortRun: async (_runId: string) => ({ ok: true, data: activeRun }),
  listAgents: async () => ({ ok: true, data: [] }),
  selectAgent: async (_scenario: string, _userPrompt: string) => ({
    ok: true,
    data: {
      id: 'general',
      name: 'General Agent',
      description: 'Mock general agent for preview mode',
      mode: 'primary',
      hidden: false,
      allows_write_tools: true,
      prompt_template: '',
      model_override: null,
      allowed_tools: [],
    },
  }),
  enterPlanMode: async (_workspaceId: string, _workspaceRoot: string) => ({
    ok: true,
    data: '/mock/path/plan.md',
  }),
  exitPlanMode: async (_workspaceId: string) => ({ ok: true, data: null }),
  getPlanModeState: async (_workspaceId: string) => ({ ok: true, data: false }),
};

export const mockSubagent: SubagentBridge = {
  spawnSubagent: async (_parentSessionId, input) => ({
    ok: true,
    data: {
      task_id: input.task_id ?? `mock-task-${Date.now()}`,
      state: 'running',
      summary: `Mock subagent spawned for: ${input.description}`,
      result: null,
      error: null,
    },
  }),
  getSubagentTask: async (_taskId: string) => ({ ok: true, data: null }),
  listActiveSubagents: async (_workspaceId: string) => ({ ok: true, data: [] }),
  cancelSubagent: async (_taskId: string) => ({ ok: true, data: true }),
};
