import type {
  ConversationScenario,
  ConfigSnapshot,
  ModelDescriptor,
  ModelGatewayHealthSnapshot,
  ModelResponse,
} from "@ai-digital-life/kernel";

export const DEFAULT_MODEL_ROUTE: ModelDescriptor[] = [
  {
    providerId: "deepseek",
    modelId: "deepseek-chat",
    displayName: "DeepSeek Chat",
    priority: 1,
    capabilities: ["chat", "stream", "code"]
  },
  {
    providerId: "minimax",
    modelId: "MiniMax-M2.5",
    displayName: "MiniMax M2.5",
    priority: 3,
    capabilities: ["chat", "stream", "code"]
  }
];

export interface ModelGatewayOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  deepseek?: Partial<ProviderRuntimeConfig>;
  minimax?: Partial<ProviderRuntimeConfig>;
  providerPreferences?: ConfigSnapshot["modelPreferences"]["providers"];
  fetchImpl?: typeof fetch;
}

export interface ProviderRuntimeConfig {
  apiKey?: string;
  baseUrl: string;
  model: string;
}

const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-chat";
const DEFAULT_MINIMAX_BASE_URL = "https://api.minimaxi.com";
const DEFAULT_MINIMAX_MODEL = "MiniMax-M2.5";
const DEFAULT_PROVIDER_PREFERENCES: ConfigSnapshot["modelPreferences"]["providers"] = {
  deepseek: {
    enabled: true,
    priority: 1,
    modelId: DEFAULT_DEEPSEEK_MODEL
  },
  minimax: {
    enabled: true,
    priority: 3,
    modelId: DEFAULT_MINIMAX_MODEL
  }
};

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function resolveProviderConfig(input: {
  options?: Partial<ProviderRuntimeConfig>;
  apiKeyEnvNames: string[];
  baseUrlEnvNames: string[];
  modelEnvNames: string[];
  defaultBaseUrl: string;
  defaultModel: string;
}): ProviderRuntimeConfig {
  const apiKey =
    input.options?.apiKey ??
    input.apiKeyEnvNames.map((envName) => process.env[envName]).find(Boolean);
  const baseUrl = trimTrailingSlash(
    input.options?.baseUrl ??
      input.baseUrlEnvNames.map((envName) => process.env[envName]).find(Boolean) ??
      input.defaultBaseUrl
  );
  const model =
    input.options?.model ??
    input.modelEnvNames.map((envName) => process.env[envName]).find(Boolean) ??
    input.defaultModel;

  return {
    apiKey,
    baseUrl,
    model
  };
}

export function resolveDeepSeekConfig(options: ModelGatewayOptions = {}): ProviderRuntimeConfig {
  const configuredModelId = options.providerPreferences?.deepseek?.modelId;
  return resolveProviderConfig({
    options: {
      apiKey: options.deepseek?.apiKey ?? options.apiKey,
      baseUrl: options.deepseek?.baseUrl ?? options.baseUrl,
      model: options.deepseek?.model ?? options.model ?? configuredModelId
    },
    apiKeyEnvNames: ["DEEPSEEK_API_KEY", "OPENAI_API_KEY", "AUTH_TOKEN"],
    baseUrlEnvNames: ["DEEPSEEK_BASE_URL", "BASE_URL"],
    modelEnvNames: ["DEEPSEEK_MODEL", "MODEL"],
    defaultBaseUrl: DEFAULT_DEEPSEEK_BASE_URL,
    defaultModel: DEFAULT_DEEPSEEK_MODEL
  });
}

export function resolveMiniMaxConfig(options: ModelGatewayOptions = {}): ProviderRuntimeConfig {
  const configuredModelId = options.providerPreferences?.minimax?.modelId;
  return resolveProviderConfig({
    options: {
      ...options.minimax,
      model: options.minimax?.model ?? configuredModelId
    },
    apiKeyEnvNames: ["MINIMAX_API_KEY", "MINIMAX_AUTH_TOKEN"],
    baseUrlEnvNames: ["MINIMAX_BASE_URL"],
    modelEnvNames: ["MINIMAX_MODEL"],
    defaultBaseUrl: DEFAULT_MINIMAX_BASE_URL,
    defaultModel: DEFAULT_MINIMAX_MODEL
  });
}

function buildProviderCatalog(input: {
  deepseekModelId: string;
  minimaxModelId: string;
  providerPreferences?: ConfigSnapshot["modelPreferences"]["providers"];
}): ModelDescriptor[] {
  const preferences = {
    deepseek: {
      ...DEFAULT_PROVIDER_PREFERENCES.deepseek,
      ...input.providerPreferences?.deepseek,
      modelId: input.providerPreferences?.deepseek?.modelId ?? input.deepseekModelId
    },
    minimax: {
      ...DEFAULT_PROVIDER_PREFERENCES.minimax,
      ...input.providerPreferences?.minimax,
      modelId: input.providerPreferences?.minimax?.modelId ?? input.minimaxModelId
    }
  };

  return [
    {
      providerId: "deepseek",
      modelId: preferences.deepseek.modelId,
      displayName: "DeepSeek Chat",
      priority: preferences.deepseek.priority,
      capabilities: ["chat", "stream", "code"]
    },
    {
      providerId: "minimax",
      modelId: preferences.minimax.modelId,
      displayName: "MiniMax M2.5",
      priority: preferences.minimax.priority,
      capabilities: ["chat", "stream", "code"]
    }
  ];
}

function sanitizeContent(value: string): string {
  return value.trim();
}

function mapScenarioToSystemPrompt(scenario: ConversationScenario): string {
  switch (scenario) {
    case "plan":
      return "You are an expert software planner. Produce a concise implementation plan in Chinese.";
    case "code-edit":
      return "You are an expert coding assistant. Explain the intended code change concisely in Chinese.";
    default:
      return "You are a helpful software assistant. Reply concisely in Chinese.";
  }
}

function buildUserPrompt(input: {
  prompt: string;
  contextSummary?: string;
}): string {
  return [sanitizeContent(input.prompt), input.contextSummary ? `Context:\n${sanitizeContent(input.contextSummary)}` : ""]
    .filter(Boolean)
    .join("\n\n");
}

async function requireSuccessfulJsonResponse<T>(
  responsePromise: Promise<Response>,
  providerLabel: string
): Promise<T> {
  const response = await responsePromise;
  if (!response.ok) {
    const failureText = await response.text();
    throw new Error(`${providerLabel} request failed (${response.status}): ${failureText}`);
  }

  return (await response.json()) as T;
}

function extractAssistantContent(message?: {
  content?: string;
  reasoning_content?: string;
}): string | undefined {
  return message?.content?.trim() || message?.reasoning_content?.trim();
}

export class ModelGateway {
  private readonly deepseekConfig: ProviderRuntimeConfig;
  private readonly minimaxConfig: ProviderRuntimeConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly providerCatalog: ModelDescriptor[];
  private readonly providerPreferences: ConfigSnapshot["modelPreferences"]["providers"];

  constructor(options: ModelGatewayOptions = {}) {
    this.deepseekConfig = resolveDeepSeekConfig(options);
    this.minimaxConfig = resolveMiniMaxConfig(options);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.providerPreferences = {
      deepseek: {
        ...DEFAULT_PROVIDER_PREFERENCES.deepseek,
        ...options.providerPreferences?.deepseek,
        modelId: options.providerPreferences?.deepseek?.modelId ?? this.deepseekConfig.model
      },
      minimax: {
        ...DEFAULT_PROVIDER_PREFERENCES.minimax,
        ...options.providerPreferences?.minimax,
        modelId: options.providerPreferences?.minimax?.modelId ?? this.minimaxConfig.model
      }
    };
    this.providerCatalog = buildProviderCatalog({
      deepseekModelId: this.deepseekConfig.model,
      minimaxModelId: this.minimaxConfig.model,
      providerPreferences: this.providerPreferences
    });
  }

  listProviders(): ModelDescriptor[] {
    return this.providerCatalog.slice().sort((left, right) => left.priority - right.priority);
  }

  async invokeDeepSeek(input: {
    scenario: ConversationScenario;
    prompt: string;
    contextSummary?: string;
  }): Promise<ModelResponse> {
    if (!this.deepseekConfig.apiKey) {
      throw new Error("DeepSeek API key is not configured.");
    }

    const payload = await requireSuccessfulJsonResponse<{
      model?: string;
      choices?: Array<{
        message?: {
          content?: string;
          reasoning_content?: string;
        };
      }>;
    }>(
      this.fetchImpl(`${this.deepseekConfig.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.deepseekConfig.apiKey}`
        },
        body: JSON.stringify({
          model: this.deepseekConfig.model,
          stream: false,
          messages: [
            {
              role: "system",
              content: mapScenarioToSystemPrompt(input.scenario)
            },
            {
              role: "user",
              content: buildUserPrompt(input)
            }
          ]
        })
      }),
      "DeepSeek"
    );
    const content = extractAssistantContent(payload.choices?.[0]?.message);
    if (!content) {
      throw new Error("DeepSeek response did not contain assistant content.");
    }

    return {
      providerId: "deepseek",
      modelId: payload.model || this.deepseekConfig.model,
      synthetic: false,
      content
    };
  }

  async invokeMiniMax(input: {
    scenario: ConversationScenario;
    prompt: string;
    contextSummary?: string;
  }): Promise<ModelResponse> {
    if (!this.minimaxConfig.apiKey) {
      throw new Error("MiniMax API key is not configured.");
    }

    const payload = await requireSuccessfulJsonResponse<{
      model?: string;
      choices?: Array<{
        message?: {
          content?: string;
          reasoning_content?: string;
        };
      }>;
    }>(
      this.fetchImpl(`${this.minimaxConfig.baseUrl}/v1/text/chatcompletion_v2`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.minimaxConfig.apiKey}`
        },
        body: JSON.stringify({
          model: this.minimaxConfig.model,
          messages: [
            {
              role: "system",
              name: "AI Digital Life",
              content: mapScenarioToSystemPrompt(input.scenario)
            },
            {
              role: "user",
              name: "User",
              content: buildUserPrompt(input)
            }
          ]
        })
      }),
      "MiniMax"
    );
    const content = extractAssistantContent(payload.choices?.[0]?.message);
    if (!content) {
      throw new Error("MiniMax response did not contain assistant content.");
    }

    return {
      providerId: "minimax",
      modelId: payload.model || this.minimaxConfig.model,
      synthetic: false,
      content
    };
  }

  async getHealthSnapshot(): Promise<ModelGatewayHealthSnapshot> {
    const checks = await Promise.all(
      [
        {
          providerId: "deepseek" as const,
          config: this.deepseekConfig,
          invoke: () =>
            this.invokeDeepSeek({
              scenario: "chat",
              prompt: "ping"
            })
        },
        {
          providerId: "minimax" as const,
          config: this.minimaxConfig,
          invoke: () =>
            this.invokeMiniMax({
              scenario: "chat",
              prompt: "ping"
            })
        }
      ].map(async (candidate) => {
        if (!candidate.config.apiKey) {
          return {
            providerId: candidate.providerId,
            healthy: false,
            detail: "API key not configured."
          };
        }

        try {
          await candidate.invoke();
          return {
            providerId: candidate.providerId,
            healthy: true,
            detail: "Provider responded successfully."
          };
        } catch (error) {
          return {
            providerId: candidate.providerId,
            healthy: false,
            detail: error instanceof Error ? error.message : String(error)
          };
        }
      })
    );

    return {
      checkedAt: Date.now(),
      providers: checks
    };
  }

  async generateResponse(input: {
    scenario: ConversationScenario;
    prompt: string;
    contextSummary?: string;
  }): Promise<ModelResponse> {
    const trimmedPrompt = input.prompt.trim();
    const suffix = input.contextSummary ? `\n\nContext:\n${input.contextSummary}` : "";
    const routeAttempts = this.listProviders()
      .filter((descriptor) => this.providerPreferences[descriptor.providerId].enabled)
      .map((descriptor) => ({
        providerId: descriptor.providerId,
        modelId: descriptor.modelId,
        invoke:
          descriptor.providerId === "deepseek"
            ? () => this.invokeDeepSeek(input)
            : () => this.invokeMiniMax(input)
      }));
    const failures: string[] = [];

    if (routeAttempts.length === 0) {
      return {
        providerId: "deepseek",
        modelId: this.deepseekConfig.model,
        synthetic: true,
        content: `Synthetic ${input.scenario} response for:\n${trimmedPrompt}${suffix}\n\nRoute failures:\nNo enabled model providers configured.`
      };
    }

    for (const attempt of routeAttempts) {
      try {
        return await attempt.invoke();
      } catch (error) {
        failures.push(`${attempt.providerId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return {
      providerId: routeAttempts[0].providerId,
      modelId: routeAttempts[0].modelId,
      synthetic: true,
      content:
        input.scenario === "plan"
          ? `Synthetic planning response for:\n${trimmedPrompt}${suffix}\n\nRoute failures:\n${failures.join("\n")}`
          : `Synthetic ${input.scenario} response for:\n${trimmedPrompt}${suffix}\n\nRoute failures:\n${failures.join("\n")}`
    };
  }
}
