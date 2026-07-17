import type { AgentConfig } from '../shared/ipc';
import type { CustomAgentBridge } from '../shared/ipc/custom_agent';
import { invokeIpc } from './tauri-shared';

export function createTauriCustomAgentBridge() {
  return {
    listCustomAgents: (dataDir) => invokeIpc<AgentConfig[]>('list_custom_agents', { dataDir }),
    addCustomAgent: (dataDir, agent) =>
      invokeIpc<AgentConfig[]>('add_custom_agent', { dataDir, agent }),
    deleteCustomAgent: (dataDir, name) =>
      invokeIpc<AgentConfig[]>('delete_custom_agent', { dataDir, name }),
  } satisfies CustomAgentBridge;
}
