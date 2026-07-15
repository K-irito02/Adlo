import type { IpcResult } from '@ai-digital-life/kernel';

export type { IpcResult };

export type McpTransportType = 'stdio' | 'sse' | 'streamable_http';

export interface McpServerConfig {
  name: string;
  transport: McpTransportType;
  command: string | null;
  args: string[];
  url: string | null;
  env: Record<string, string>;
  oauth: boolean;
  enabled: boolean;
}

export interface McpServerInfo {
  name: string;
  state: 'disconnected' | 'connecting' | 'connected' | 'error';
}

export interface McpToolEntry {
  server_name: string;
  name: string;
  description: string;
  input_schema: unknown;
}

export interface McpResourceEntry {
  server_name: string;
  uri: string;
  name: string;
  description: string | null;
  mime_type: string | null;
}

export interface McpCatalog {
  tools: McpToolEntry[];
  resources: McpResourceEntry[];
}

export interface McpBridge {
  listMcpServers(): Promise<IpcResult<McpServerInfo[]>>;
  addMcpServer(config: McpServerConfig): Promise<IpcResult<void>>;
  removeMcpServer(name: string): Promise<IpcResult<void>>;
  connectMcpServer(name: string): Promise<IpcResult<void>>;
  disconnectMcpServer(name: string): Promise<IpcResult<void>>;
  getMcpCatalog(): Promise<IpcResult<McpCatalog>>;
  loadMcpConfig(path: string): Promise<IpcResult<number>>;
}
