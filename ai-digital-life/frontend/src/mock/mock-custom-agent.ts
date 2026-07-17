import type { AgentConfig } from "../shared/ipc";
import type { CustomAgentBridge } from "../shared/ipc/custom_agent";

export const mockCustomAgent: CustomAgentBridge = {
  listCustomAgents: async () => ({ ok: true, data: [] as AgentConfig[] }),
  addCustomAgent: async (_dataDir, agent) => ({
    ok: true,
    data: [agent] as AgentConfig[],
  }),
  deleteCustomAgent: async () => ({ ok: true, data: [] as AgentConfig[] }),
};
