import { afterEach, describe, expect, it, vi } from "vitest";
import { ModelGateway, resolveDeepSeekConfig, resolveMiniMaxConfig } from "@ai-digital-life/model-gateway";

describe("model gateway", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("resolves runtime config from explicit options and env", () => {
    process.env.AUTH_TOKEN = "token-from-env";
    process.env.BASE_URL = "https://api.deepseek.com/";
    process.env.MODEL = "deepseek-reasoner";

    expect(resolveDeepSeekConfig()).toEqual({
      apiKey: "token-from-env",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-reasoner"
    });

    expect(
      resolveDeepSeekConfig({
        apiKey: "direct-token",
        baseUrl: "https://example.com/",
        model: "deepseek-chat"
      })
    ).toEqual({
      apiKey: "direct-token",
      baseUrl: "https://example.com",
      model: "deepseek-chat"
    });

    process.env.MINIMAX_API_KEY = "minimax-token";
    process.env.MINIMAX_BASE_URL = "https://api.minimaxi.com/";
    process.env.MINIMAX_MODEL = "MiniMax-M2.5";
    expect(resolveMiniMaxConfig()).toEqual({
      apiKey: "minimax-token",
      baseUrl: "https://api.minimaxi.com",
      model: "MiniMax-M2.5"
    });
  });

  it("uses the real deepseek response when the provider call succeeds", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          model: "deepseek-chat",
          choices: [
            {
              message: {
                content: "真实模型响应"
              }
            }
          ]
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        }
      )
    );
    const gateway = new ModelGateway({
      apiKey: "token",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    const result = await gateway.generateResponse({
      scenario: "chat",
      prompt: "hello"
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(result.synthetic).toBe(false);
    expect(result.content).toBe("真实模型响应");
  });

  it("falls back to synthetic content when the provider call fails", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network failed");
    });
    const gateway = new ModelGateway({
      apiKey: "token",
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    const result = await gateway.generateResponse({
      scenario: "code-edit",
      prompt: "update file",
      contextSummary: "packages/kernel/src/index.ts"
    });

    expect(result.synthetic).toBe(true);
    expect(result.content).toContain("Synthetic code-edit response for:");
  });

  it("fails over to minimax when deepseek is unavailable", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("deepseek")) {
        return new Response("deepseek failed", { status: 500 });
      }

      return new Response(
        JSON.stringify({
          model: "MiniMax-M2.5",
          choices: [
            {
              message: {
                content: "MiniMax 接管成功"
              }
            }
          ]
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    });
    const gateway = new ModelGateway({
      deepseek: {
        apiKey: "deepseek-token",
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-chat"
      },
      minimax: {
        apiKey: "minimax-token",
        baseUrl: "https://api.minimaxi.com",
        model: "MiniMax-M2.5"
      },
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    const result = await gateway.generateResponse({
      scenario: "chat",
      prompt: "hello"
    });

    expect(result.synthetic).toBe(false);
    expect(result.providerId).toBe("minimax");
    expect(result.content).toBe("MiniMax 接管成功");
  });

  it("honors provider preferences for enabled state and priority", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("minimaxi")) {
        return new Response(
          JSON.stringify({
            model: "MiniMax-M2.5",
            choices: [
              {
                message: {
                  content: "MiniMax first"
                }
              }
            ]
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        );
      }

      return new Response("deepseek should be disabled", { status: 500 });
    });
    const gateway = new ModelGateway({
      deepseek: {
        apiKey: "deepseek-token",
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-chat"
      },
      minimax: {
        apiKey: "minimax-token",
        baseUrl: "https://api.minimaxi.com",
        model: "MiniMax-M2.5"
      },
      providerPreferences: {
        deepseek: {
          enabled: false,
          priority: 5,
          modelId: "deepseek-chat"
        },
        minimax: {
          enabled: true,
          priority: 1,
          modelId: "MiniMax-M2.5"
        }
      },
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    const result = await gateway.generateResponse({
      scenario: "chat",
      prompt: "hello"
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(result.providerId).toBe("minimax");
    expect(gateway.listProviders().map((provider) => provider.providerId)).toEqual(["minimax", "deepseek"]);
  });
});
