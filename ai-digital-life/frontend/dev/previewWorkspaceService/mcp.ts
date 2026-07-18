import type { McpServerConfig } from '../../src/shared/ipc';
import { readFile } from 'node:fs/promises';

export async function loadMcpConfig(path: string): Promise<McpServerConfig[]> {
  try {
    const content = await readFile(path, 'utf8');
    const config = JSON.parse(content);
    const servers = config.mcpServers || config.servers || [];
    return servers.map((s: Record<string, unknown>) => ({
      name: String(s.name || ''),
      transport: String(s.transport || 'stdio'),
      command: s.command ? String(s.command) : undefined,
      args: Array.isArray(s.args) ? s.args.map(String) : undefined,
      url: s.url ? String(s.url) : undefined,
    })) as McpServerConfig[];
  } catch {
    return [];
  }
}
