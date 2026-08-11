import type { ModelProviderId } from './types';
import type { ConversationRole } from './types-conversation';

// ════════════════════════════════════════════════════════
// Model Descriptor / Chat / Response
// ════════════════════════════════════════════════════════

export interface ModelDescriptor {
  providerId: ModelProviderId;
  modelId: string;
  displayName: string;
  priority: number;
  capabilities: ('chat' | 'stream' | 'code')[];
}

export interface ModelChatMessage {
  role: ConversationRole;
  content: string;
}

export interface ModelTokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  estimated?: boolean;
  cost?: ModelUsageCost;
}

export interface ModelUsageCost {
  inputCost?: number;
  outputCost?: number;
  cacheReadCost?: number;
  cacheWriteCost?: number;
  totalCost?: number;
}

export interface ModelRouteDecision {
  reason: string;
  chain: string[];
  synthetic?: boolean;
}

export interface ModelResponse {
  providerId: ModelProviderId;
  modelId: string;
  content: string;
  synthetic: boolean;
  requestId?: string;
  usage?: ModelTokenUsage;
  route?: ModelRouteDecision;
}

/** Main → Renderer: versioned model stream envelope (no secrets). */
export type DigitalLifeModelStreamEventV1 =
  | { v: 1; runId: string; seq: number; type: 'delta'; text: string }
  | {
      v: 1;
      runId: string;
      seq: number;
      type: 'route';
      providerId: ModelProviderId;
      modelId: string;
      reason: string;
    }
  | { v: 1; runId: string; seq: number; type: 'usage'; usage: ModelTokenUsage }
  | { v: 1; runId: string; seq: number; type: 'error'; message: string }
  | { v: 1; runId: string; seq: number; type: 'done' };

// ════════════════════════════════════════════════════════
// Provider Health / Prompt Rules / Context
// ════════════════════════════════════════════════════════

export interface ProviderHealthStatus {
  providerId: ModelProviderId;
  healthy: boolean;
  detail: string;
}

export interface ModelGatewayHealthSnapshot {
  checkedAt: number;
  providers: ProviderHealthStatus[];
}

export interface PromptRule {
  id: string;
  kind: 'platform' | 'project' | 'session' | 'workflow-phase' | 'tool-contract' | 'output-contract';
  content: string;
}

export interface ContextEntry {
  id: string;
  type: 'file' | 'search-hit' | 'outline' | 'diagnostic' | 'message';
  label: string;
  content: string;
  tokenEstimate: number;
  path?: string;
}
