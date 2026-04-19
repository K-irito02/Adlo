import type {
  ConversationScenario,
  ConfigSnapshot,
  DigitalLifeModelStreamEventV1,
  ModelDescriptor,
  ModelGatewayHealthSnapshot,
  ModelProviderId,
  ModelResponse,
  ModelTokenUsage,
} from "@ai-digital-life/kernel";
import { createId } from "@ai-digital-life/kernel";

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

const DEFAULT_FIRST_BYTE_TIMEOUT_MS = 45_000;
const DEFAULT_TOTAL_STREAM_MS = 180_000;

function roughTokenEstimate(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function usageFromApiPayload(usage?: {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}): ModelTokenUsage | undefined {
  if (!usage) {
    return undefined;
  }
  const promptTokens = usage.prompt_tokens;
  const completionTokens = usage.completion_tokens;
  const totalTokens = usage.total_tokens ?? (promptTokens ?? 0) + (completionTokens ?? 0);
  if (promptTokens == null && completionTokens == null) {
    return undefined;
  }
  return { promptTokens, completionTokens, totalTokens, estimated: false };
}

function mergeUsageEstimate(input: { promptText: string; completionText: string }): ModelTokenUsage {
  return {
    promptTokens: roughTokenEstimate(input.promptText),
    completionTokens: roughTokenEstimate(input.completionText),
    totalTokens: roughTokenEstimate(`${input.promptText}${input.completionText}`),
    estimated: true
  };
}

function abortAfterMs(ms: number): AbortSignal {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

function linkAbortSignals(userSignal: AbortSignal | undefined, ...timeouts: AbortSignal[]): AbortController {
  const master = new AbortController();
  const forward = () => {
    if (!master.signal.aborted) {
      master.abort();
    }
  };
  userSignal?.addEventListener("abort", forward, { once: true });
  for (const signal of timeouts) {
    signal.addEventListener("abort", forward, { once: true });
  }
  if (userSignal?.aborted || timeouts.some((signal) => signal.aborted)) {
    forward();
  }
  return master;
}

async function* parseOpenAiCompatibleSseStream(params: {
  body: ReadableStream<Uint8Array>;
  signal: AbortSignal;
}): AsyncGenerator<{ text?: string; usage?: ModelTokenUsage }> {
  const reader = params.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (!params.signal.aborted) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      for (;;) {
        const newline = buffer.indexOf("\n");
        if (newline < 0) {
          break;
        }
        const rawLine = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        const line = rawLine.replace(/\r$/, "").trim();
        if (!line.startsWith("data:")) {
          continue;
        }
        const data = line.slice(5).trim();
        if (data === "[DONE]") {
          return;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(data) as {
            choices?: Array<{
              delta?: { content?: string; reasoning_content?: string };
              message?: { content?: string; reasoning_content?: string };
            }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
            error?: { message?: string };
          };
        } catch {
          continue;
        }
        if (typeof parsed === "object" && parsed && "error" in parsed) {
          const message = (parsed as { error?: { message?: string } }).error?.message;
          throw new Error(message || "Stream provider error.");
        }
        const choice = (parsed as { choices?: unknown[] }).choices?.[0] as
          | {
              delta?: { content?: string; reasoning_content?: string };
              message?: { content?: string; reasoning_content?: string };
            }
          | undefined;
        const piece =
          choice?.delta?.content ??
          choice?.delta?.reasoning_content ??
          choice?.message?.content ??
          choice?.message?.reasoning_content;
        if (piece) {
          yield { text: piece };
        }
        const usage = usageFromApiPayload((parsed as { usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } }).usage);
        if (usage) {
          yield { usage };
        }
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* ignore */
    }
  }
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

    const systemPrompt = mapScenarioToSystemPrompt(input.scenario);
    const userContent = buildUserPrompt(input);
    const payload = await requireSuccessfulJsonResponse<{
      model?: string;
      choices?: Array<{
        message?: {
          content?: string;
          reasoning_content?: string;
        };
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
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
              content: systemPrompt
            },
            {
              role: "user",
              content: userContent
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

    const requestId = createId("mreq");
    const usage = usageFromApiPayload(payload.usage) ?? mergeUsageEstimate({ promptText: `${systemPrompt}\n${userContent}`, completionText: content });

    return {
      providerId: "deepseek",
      modelId: payload.model || this.deepseekConfig.model,
      synthetic: false,
      content,
      requestId,
      usage,
      route: { reason: "priority_provider", chain: ["deepseek"], synthetic: false }
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

    const systemPrompt = mapScenarioToSystemPrompt(input.scenario);
    const userContent = buildUserPrompt(input);
    const payload = await requireSuccessfulJsonResponse<{
      model?: string;
      choices?: Array<{
        message?: {
          content?: string;
          reasoning_content?: string;
        };
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
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
              content: systemPrompt
            },
            {
              role: "user",
              name: "User",
              content: userContent
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

    const requestId = createId("mreq");
    const usage = usageFromApiPayload(payload.usage) ?? mergeUsageEstimate({ promptText: `${systemPrompt}\n${userContent}`, completionText: content });

    return {
      providerId: "minimax",
      modelId: payload.model || this.minimaxConfig.model,
      synthetic: false,
      content,
      requestId,
      usage,
      route: { reason: "priority_provider", chain: ["minimax"], synthetic: false }
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
      const content = `Synthetic ${input.scenario} response for:\n${trimmedPrompt}${suffix}\n\nRoute failures:\nNo enabled model providers configured.`;
      return {
        providerId: "deepseek",
        modelId: this.deepseekConfig.model,
        synthetic: true,
        content,
        requestId: createId("mreq"),
        usage: mergeUsageEstimate({ promptText: trimmedPrompt + suffix, completionText: content }),
        route: {
          reason: "no_enabled_provider",
          chain: [],
          synthetic: true
        }
      };
    }

    const chain = routeAttempts.map((attempt) => `${attempt.providerId}:${attempt.modelId}`);
    for (const attempt of routeAttempts) {
      try {
        const response = await attempt.invoke();
        return {
          ...response,
          route: {
            reason: `routed_${attempt.providerId}`,
            chain,
            synthetic: response.synthetic
          }
        };
      } catch (error) {
        failures.push(`${attempt.providerId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const fallbackContent =
      input.scenario === "plan"
        ? `Synthetic planning response for:\n${trimmedPrompt}${suffix}\n\nRoute failures:\n${failures.join("\n")}`
        : `Synthetic ${input.scenario} response for:\n${trimmedPrompt}${suffix}\n\nRoute failures:\n${failures.join("\n")}`;
    return {
      providerId: routeAttempts[0].providerId,
      modelId: routeAttempts[0].modelId,
      synthetic: true,
      content: fallbackContent,
      requestId: createId("mreq"),
      usage: mergeUsageEstimate({ promptText: trimmedPrompt + suffix, completionText: fallbackContent }),
      route: {
        reason: "all_providers_failed_synthetic",
        chain,
        synthetic: true
      }
    };
  }

  /**
   * Streams assistant text for the first successful provider route.
   * DeepSeek uses native SSE; MiniMax is degraded to a single chunk (API not unified for SSE here).
   */
  async *generateResponseStream(input: {
    scenario: ConversationScenario;
    prompt: string;
    contextSummary?: string;
    runId: string;
    workspaceId: string;
    sessionId: string;
    signal?: AbortSignal;
    firstByteTimeoutMs?: number;
    totalTimeoutMs?: number;
  }): AsyncGenerator<DigitalLifeModelStreamEventV1> {
    const firstByteMs = input.firstByteTimeoutMs ?? DEFAULT_FIRST_BYTE_TIMEOUT_MS;
    const totalMs = input.totalTimeoutMs ?? DEFAULT_TOTAL_STREAM_MS;
    let seq = 0;
    const nextSeq = () => {
      seq += 1;
      return seq;
    };

    const routeAttempts = this.listProviders()
      .filter((descriptor) => this.providerPreferences[descriptor.providerId].enabled)
      .map((descriptor) => ({
        providerId: descriptor.providerId as ModelProviderId,
        modelId: descriptor.modelId
      }));

    if (routeAttempts.length === 0) {
      yield {
        v: 1,
        runId: input.runId,
        seq: nextSeq(),
        type: "error",
        message: "No enabled model providers configured."
      };
      yield { v: 1, runId: input.runId, seq: nextSeq(), type: "done" };
      return;
    }

    const failures: string[] = [];
    const chain = routeAttempts.map((attempt) => `${attempt.providerId}:${attempt.modelId}`);

    for (const attempt of routeAttempts) {
      const totalTimeout = abortAfterMs(totalMs);
      const linked = linkAbortSignals(input.signal, totalTimeout);
      const signal = linked.signal;

      yield {
        v: 1,
        runId: input.runId,
        seq: nextSeq(),
        type: "route",
        providerId: attempt.providerId,
        modelId: attempt.modelId,
        reason: `trying_provider_priority`
      };

      try {
        if (attempt.providerId === "deepseek") {
          if (!this.deepseekConfig.apiKey) {
            throw new Error("DeepSeek API key is not configured.");
          }
          const streamResponse = await this.fetchImpl(`${this.deepseekConfig.baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${this.deepseekConfig.apiKey}`
            },
            body: JSON.stringify({
              model: this.deepseekConfig.model,
              stream: true,
              messages: [
                { role: "system", content: mapScenarioToSystemPrompt(input.scenario) },
                { role: "user", content: buildUserPrompt(input) }
              ]
            }),
            signal
          });

          if (!streamResponse.ok) {
            const failureText = await streamResponse.text();
            throw new Error(`DeepSeek stream failed (${streamResponse.status}): ${failureText}`);
          }
          if (!streamResponse.body) {
            throw new Error("DeepSeek stream response has no body.");
          }

          const firstByteController = new AbortController();
          let firstByteTimer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => firstByteController.abort(), firstByteMs);
          const parseSignal = linkAbortSignals(signal, firstByteController.signal).signal;

          let aggregatedUsage: ModelTokenUsage | undefined;
          let completionBuffer = "";
          try {
            for await (const chunk of parseOpenAiCompatibleSseStream({
              body: streamResponse.body,
              signal: parseSignal
            })) {
              if (firstByteTimer) {
                clearTimeout(firstByteTimer);
                firstByteTimer = undefined;
              }
              if (chunk.usage) {
                aggregatedUsage = chunk.usage;
              }
              if (chunk.text) {
                completionBuffer += chunk.text;
                yield { v: 1, runId: input.runId, seq: nextSeq(), type: "delta", text: chunk.text };
              }
            }
          } finally {
            if (firstByteTimer) {
              clearTimeout(firstByteTimer);
            }
          }

          if (aggregatedUsage) {
            yield { v: 1, runId: input.runId, seq: nextSeq(), type: "usage", usage: aggregatedUsage };
          } else {
            yield {
              v: 1,
              runId: input.runId,
              seq: nextSeq(),
              type: "usage",
              usage: mergeUsageEstimate({
                promptText: `${mapScenarioToSystemPrompt(input.scenario)}\n${buildUserPrompt(input)}`,
                completionText: completionBuffer
              })
            };
          }
          yield { v: 1, runId: input.runId, seq: nextSeq(), type: "done" };
          return;
        }

        if (attempt.providerId === "minimax") {
          const modelResponse = await this.invokeMiniMax({
            scenario: input.scenario,
            prompt: input.prompt,
            contextSummary: input.contextSummary
          });
          yield { v: 1, runId: input.runId, seq: nextSeq(), type: "delta", text: modelResponse.content };
          if (modelResponse.usage) {
            yield { v: 1, runId: input.runId, seq: nextSeq(), type: "usage", usage: modelResponse.usage };
          } else {
            yield {
              v: 1,
              runId: input.runId,
              seq: nextSeq(),
              type: "usage",
              usage: mergeUsageEstimate({
                promptText: `${mapScenarioToSystemPrompt(input.scenario)}\n${buildUserPrompt(input)}`,
                completionText: modelResponse.content
              })
            };
          }
          yield { v: 1, runId: input.runId, seq: nextSeq(), type: "done" };
          return;
        }

        throw new Error(`Unsupported streaming provider: ${attempt.providerId}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${attempt.providerId}: ${message}`);
        yield {
          v: 1,
          runId: input.runId,
          seq: nextSeq(),
          type: "error",
          message: `${attempt.providerId} failed: ${message}`
        };
      }
    }

    yield {
      v: 1,
      runId: input.runId,
      seq: nextSeq(),
      type: "error",
      message: `All providers failed:\n${failures.join("\n")}`
    };
    yield { v: 1, runId: input.runId, seq: nextSeq(), type: "done" };
  }
}
