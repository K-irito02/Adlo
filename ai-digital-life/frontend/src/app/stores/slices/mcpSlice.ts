import type { McpServerInfo, McpCatalog } from '@shared/ipc';
import type { StoreState } from '../StoreState';

export interface McpSlice {
  mcpServers: McpServerInfo[];
  mcpCatalog: McpCatalog | null;
  isFetchingMcp: boolean;

  setMcpServers: (servers: McpServerInfo[]) => void;
  setMcpCatalog: (catalog: McpCatalog | null) => void;
  setIsFetchingMcp: (fetching: boolean) => void;
}

export const createMcpSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
  _get: () => StoreState,
): McpSlice => ({
  mcpServers: [],
  mcpCatalog: null,
  isFetchingMcp: false,

  setMcpServers: (servers) => set({ mcpServers: servers }),
  setMcpCatalog: (catalog) => set({ mcpCatalog: catalog }),
  setIsFetchingMcp: (fetching) => set({ isFetchingMcp: fetching }),
});
