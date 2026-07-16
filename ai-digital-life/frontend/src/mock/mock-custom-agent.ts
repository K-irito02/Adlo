import type { AgentConfig, CustomAgentBridge } from "../shared/ipc";

export const mockCustomAgent: CustomAgentBridge = {
  listCustomAgents: async () => ({ ok: true, data: [] as AgentConfig[] }),
  addCustomAgent: async (_dataDir, agent) => ({
    ok: true,
    data: [agent] as AgentConfig[],
  }),
  deleteCustomAgent: async () => ({ ok: true, data: [] as AgentConfig[] }),
};
