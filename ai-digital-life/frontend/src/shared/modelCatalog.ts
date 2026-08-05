import type { ModelCapability, ModelDefinition, ModelTier } from '@ai-digital-life/kernel';

export interface CatalogProvider {
  id: string;
  name: string;
  description: string;
  apiType: string;
  builtIn: boolean;
  requiresKey: boolean;
  baseUrl: string | null;
  models: ModelDefinition[];
}

const model = (
  id: string,
  providerId: string,
  name: string,
  capabilities: ModelCapability[],
  opts: { tier?: ModelTier; contextWindow?: number } = {},
): ModelDefinition => ({
  id,
  providerId,
  name,
  capabilities,
  tier: opts.tier,
  contextWindow: opts.contextWindow,
});

// Static catalog mirroring the Rust backend (setup.rs `register_builtin_providers`
// + crates/model-gateway/src/providers/*.rs `supported_models()`).
export const MODEL_CATALOG: CatalogProvider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'OpenAI GPT series models',
    apiType: 'OpenAICompatible',
    builtIn: true,
    requiresKey: true,
    baseUrl: 'https://api.openai.com/v1',
    models: [
      model('gpt-4o', 'openai', 'GPT-4o', ['text', 'vision', 'tooluse', 'streaming'], {
        tier: 'premium',
        contextWindow: 128000,
      }),
      model('gpt-4o-mini', 'openai', 'GPT-4o Mini', ['text', 'tooluse', 'streaming'], {
        tier: 'standard',
        contextWindow: 128000,
      }),
      model('gpt-4-turbo', 'openai', 'GPT-4 Turbo', ['text', 'vision', 'tooluse', 'streaming'], {
        tier: 'premium',
        contextWindow: 128000,
      }),
      model('gpt-3.5-turbo', 'openai', 'GPT-3.5 Turbo', ['text', 'tooluse', 'streaming'], {
        tier: 'standard',
        contextWindow: 16384,
      }),
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Anthropic Claude series models',
    apiType: 'AnthropicNative',
    builtIn: true,
    requiresKey: true,
    baseUrl: 'https://api.anthropic.com/v1',
    models: [
      model(
        'claude-3-5-sonnet-20241022',
        'anthropic',
        'Claude 3.5 Sonnet',
        ['text', 'vision', 'tooluse', 'streaming'],
        { tier: 'premium', contextWindow: 200000 },
      ),
      model(
        'claude-3-5-haiku-20241022',
        'anthropic',
        'Claude 3.5 Haiku',
        ['text', 'vision', 'tooluse', 'streaming'],
        { tier: 'standard', contextWindow: 200000 },
      ),
      model('claude-3-opus-20240229', 'anthropic', 'Claude 3 Opus', ['text', 'vision', 'tooluse'], {
        tier: 'premium',
        contextWindow: 200000,
      }),
    ],
  },
  {
    id: 'google',
    name: 'Google Gemini',
    description: 'Google Gemini models',
    apiType: 'GoogleNative',
    builtIn: true,
    requiresKey: true,
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: [
      model(
        'gemini-1.5-pro',
        'google',
        'Gemini 1.5 Pro',
        ['text', 'vision', 'tooluse', 'streaming'],
        { tier: 'premium', contextWindow: 2097152 },
      ),
      model(
        'gemini-1.5-flash',
        'google',
        'Gemini 1.5 Flash',
        ['text', 'vision', 'tooluse', 'streaming'],
        { tier: 'standard', contextWindow: 1048576 },
      ),
      model(
        'gemini-2.0-flash',
        'google',
        'Gemini 2.0 Flash',
        ['text', 'vision', 'tooluse', 'streaming'],
        { tier: 'standard', contextWindow: 1048576 },
      ),
    ],
  },
  {
    id: 'ollama',
    name: 'Ollama',
    description: 'Local Ollama models',
    apiType: 'Ollama',
    builtIn: true,
    requiresKey: false,
    baseUrl: 'http://localhost:11434',
    models: [
      model('llama3.1', 'ollama', 'Llama 3.1', ['text', 'streaming'], {
        tier: 'standard',
        contextWindow: 128000,
      }),
      model('qwen2.5', 'ollama', 'Qwen 2.5', ['text', 'streaming'], {
        tier: 'standard',
        contextWindow: 128000,
      }),
      model('deepseek-r1', 'ollama', 'DeepSeek R1', ['text', 'reasoning', 'streaming'], {
        tier: 'standard',
        contextWindow: 128000,
      }),
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'OpenRouter unified API',
    apiType: 'OpenAICompatible',
    builtIn: true,
    requiresKey: true,
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [
      model('openrouter/auto', 'openrouter', 'OpenRouter Auto', ['text', 'streaming'], {
        tier: 'standard',
      }),
      model(
        'anthropic/claude-3.5-sonnet',
        'openrouter',
        'Claude 3.5 Sonnet',
        ['text', 'vision', 'tooluse', 'streaming'],
        { tier: 'premium' },
      ),
      model('openai/gpt-4o', 'openrouter', 'GPT-4o', ['text', 'vision', 'tooluse', 'streaming'], {
        tier: 'premium',
      }),
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'DeepSeek chat models',
    apiType: 'OpenAICompatible',
    builtIn: true,
    requiresKey: true,
    baseUrl: 'https://api.deepseek.com',
    models: [
      model('deepseek-chat', 'deepseek', 'DeepSeek Chat', ['text', 'streaming'], {
        tier: 'standard',
      }),
    ],
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    description: 'MiniMax models',
    apiType: 'OpenAICompatible',
    builtIn: true,
    requiresKey: true,
    baseUrl: 'https://api.minimax.io',
    models: [
      model('MiniMax-M2.7', 'minimax', 'MiniMax M2.7', ['text', 'streaming'], {
        tier: 'standard',
      }),
    ],
  },
];

export function getCatalogProvider(providerId: string): CatalogProvider | undefined {
  return MODEL_CATALOG.find((p) => p.id === providerId);
}
