import type { StoreState } from '../StoreState';
import type { StoreApi } from 'zustand';
import { clearError, captureError } from '../shared';
const SCOPE = 'agent';

export function createAgentActions(set: StoreApi<StoreState>['setState'], get: () => StoreState) {
  return {
    /**
     * [fetchAgents - 拉取可用的 Agent 列表]
     * @writes agentSlice.availableAgents, agentSlice.isFetchingAgents
     * @see shared/ipc/agent.ts → agent.listAgents
     * @see tauri-bridge.ts → agent.listAgents
     * @see mock-bridge.ts → agent.listAgents
     */
    fetchAgents: async () => {
      set({ isFetchingAgents: true });
      clearError(get, SCOPE);
      const result = await window.digitalLife.agent.listAgents();
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        set({ isFetchingAgents: false });
        return;
      }
      set({ availableAgents: result.data, isFetchingAgents: false });
    },

    /**
     * [selectAgentForScenario - 根据场景选择 Agent]
     * @writes agentSlice.selectedAgent
     * @see shared/ipc/agent.ts → agent.selectAgent
     */
    selectAgentForScenario: async (scenario: string, userPrompt: string) => {
      clearError(get, SCOPE);
      const result = await window.digitalLife.agent.selectAgent(scenario, userPrompt);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return;
      }
      set({ selectedAgent: result.data });
    },

    /**
     * [enterPlanMode - 进入 Plan 模式]
     * @writes agentSlice.planModeActive, agentSlice.planFile
     * @see shared/ipc/agent.ts → agent.enterPlanMode
     */
    enterPlanMode: async (workspaceId: string, workspaceRoot: string) => {
      clearError(get, SCOPE);
      const result = await window.digitalLife.agent.enterPlanMode(workspaceId, workspaceRoot);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return;
      }
      set({ planModeActive: true, planFile: result.data });
    },

    /**
     * [exitPlanMode - 退出 Plan 模式]
     * @writes agentSlice.planModeActive, agentSlice.planFile
     * @see shared/ipc/agent.ts → agent.exitPlanMode
     */
    exitPlanMode: async (workspaceId: string) => {
      clearError(get, SCOPE);
      const result = await window.digitalLife.agent.exitPlanMode(workspaceId);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return;
      }
      set({ planModeActive: false, planFile: null });
    },

    /**
     * [refreshPlanModeState - 刷新 Plan 模式状态]
     * @writes agentSlice.planModeActive
     * @see shared/ipc/agent.ts → agent.getPlanModeState
     */
    refreshPlanModeState: async (workspaceId: string) => {
      const result = await window.digitalLife.agent.getPlanModeState(workspaceId);
      if (!result.ok) {
        // Plan mode state refresh is non-critical, silently fail
        console.warn('Failed to refresh plan mode state', result.error);
        return;
      }
      set({ planModeActive: result.data });
    },
  };
}
