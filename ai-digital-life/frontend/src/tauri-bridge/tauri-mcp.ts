import type { McpBridge, McpCatalog, McpServerConfig, McpServerInfo } from '../shared/ipc';
import { invokeIpc } from './tauri-shared';

export function createTauriMcpBridge(): McpBridge {
  return {
    listMcpServers: () => invokeIpc<McpServerInfo[]>('list_mcp_servers'),
    addMcpServer: (config: McpServerConfig) => invokeIpc<void>('add_mcp_server', { config }),
    removeMcpServer: (name: string) => invokeIpc<void>('remove_mcp_server', { name }),
    connectMcpServer: (name: string) => invokeIpc<void>('connect_mcp_server', { name }),
    disconnectMcpServer: (name: string) => invokeIpc<void>('disconnect_mcp_server', { name }),
    getMcpCatalog: () => invokeIpc<McpCatalog>('get_mcp_catalog'),
    loadMcpConfig: (path: string) => invokeIpc<number>('load_mcp_config', { path }),
  };
}
