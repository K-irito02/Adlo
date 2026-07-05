import type { AgentConfig } from './agent';
import type { IpcResult } from '@ai-digital-life/kernel';

export type AgentMode = 'primary' | 'subagent' | 'hidden';
export type AgentIdType =
  | 'build'
  | 'plan'
  | 'general'
  | 'explore'
  | 'compaction'
  | 'title'
  | 'summary'
  | 'custom';

export interface CustomAgentBridge {
  listCustomAgents(dataDir: string): Promise<IpcResult<AgentConfig[]>>;
  addCustomAgent(dataDir: string, agent: AgentConfig): Promise<IpcResult<AgentConfig[]>>;
  deleteCustomAgent(dataDir: string, name: string): Promise<IpcResult<AgentConfig[]>>;
}
