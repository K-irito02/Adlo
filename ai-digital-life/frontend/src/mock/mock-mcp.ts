import type { McpBridge, McpServerConfig } from "../shared/ipc";

export const mockMcp: McpBridge = {
  listMcpServers: async () => ({ ok: true, data: [] }),
  addMcpServer: async (_config: McpServerConfig) => ({ ok: true, data: undefined }),
  removeMcpServer: async (_name: string) => ({ ok: true, data: undefined }),
  connectMcpServer: async (_name: string) => ({ ok: true, data: undefined }),
  disconnectMcpServer: async (_name: string) => ({ ok: true, data: undefined }),
  getMcpCatalog: async () => ({ ok: true, data: { tools: [], resources: [] } }),
  loadMcpConfig: async (_path: string) => ({ ok: true, data: 0 }),
};
