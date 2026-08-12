import type { StoreState } from '../StoreState';
import type { StoreApi } from 'zustand';
import type { McpServerConfig } from '@shared/ipc';
import { clearError, captureError } from '../shared';
const SCOPE = 'mcp';

export function createMcpActions(set: StoreApi<StoreState>['setState'], get: () => StoreState) {
  return {
    /**
     * [fetchMcpServers - 拉取 MCP 服务器列表]
     * @writes mcpSlice.mcpServers, mcpSlice.isFetchingMcp
     * @see shared/ipc/mcp.ts → mcp.listMcpServers
     * @see tauri-bridge.ts → mcp.listMcpServers
     * @see mock-bridge.ts → mcp.listMcpServers
     */
    fetchMcpServers: async () => {
      set({ isFetchingMcp: true });
      clearError(get, SCOPE);
      const result = await window.digitalLife.mcp.listMcpServers();
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        set({ isFetchingMcp: false });
        return;
      }
      set({ mcpServers: result.data, isFetchingMcp: false });
    },

    /**
     * [fetchMcpCatalog - 拉取 MCP 工具/资源目录]
     * @writes mcpSlice.mcpCatalog
     * @see shared/ipc/mcp.ts → mcp.getMcpCatalog
     */
    fetchMcpCatalog: async () => {
      const result = await window.digitalLife.mcp.getMcpCatalog();
      if (!result.ok) {
        console.warn('Failed to fetch MCP catalog', result.error);
        return;
      }
      set({ mcpCatalog: result.data });
    },

    /**
     * [addMcpServer - 添加新的 MCP 服务器配置]
     * @writes mcpSlice.mcpServers (via fetchMcpServers)
     * @see shared/ipc/mcp.ts → mcp.addMcpServer
     */
    addMcpServer: async (config: McpServerConfig) => {
      clearError(get, SCOPE);
      const result = await window.digitalLife.mcp.addMcpServer(config);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return;
      }
      await get().fetchMcpServers();
    },

    /**
     * [removeMcpServer - 移除 MCP 服务器]
     * @writes mcpSlice.mcpServers (via fetchMcpServers)
     * @see shared/ipc/mcp.ts → mcp.removeMcpServer
     */
    removeMcpServer: async (name: string) => {
      clearError(get, SCOPE);
      const result = await window.digitalLife.mcp.removeMcpServer(name);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return;
      }
      await get().fetchMcpServers();
    },

    /**
     * [connectMcpServer - 连接 MCP 服务器]
     * @writes mcpSlice.mcpServers (via fetchMcpServers)
     * @see shared/ipc/mcp.ts → mcp.connectMcpServer
     */
    connectMcpServer: async (name: string) => {
      clearError(get, SCOPE);
      const result = await window.digitalLife.mcp.connectMcpServer(name);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return;
      }
      await get().fetchMcpServers();
    },

    /**
     * [disconnectMcpServer - 断开 MCP 服务器连接]
     * @writes mcpSlice.mcpServers (via fetchMcpServers)
     * @see shared/ipc/mcp.ts → mcp.disconnectMcpServer
     */
    disconnectMcpServer: async (name: string) => {
      clearError(get, SCOPE);
      const result = await window.digitalLife.mcp.disconnectMcpServer(name);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return;
      }
      await get().fetchMcpServers();
    },

    /**
     * [loadMcpConfig - 加载 MCP 配置文件]
     * @writes mcpSlice.mcpServers (via fetchMcpServers)
     * @see shared/ipc/mcp.ts → mcp.loadMcpConfig
     */
    loadMcpConfig: async (path: string) => {
      clearError(get, SCOPE);
      const result = await window.digitalLife.mcp.loadMcpConfig(path);
      if (!result.ok) {
        captureError(get, result.error, SCOPE);
        return;
      }
      await get().fetchMcpServers();
    },
  };
}
