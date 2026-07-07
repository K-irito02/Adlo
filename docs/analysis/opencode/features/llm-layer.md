# LLM 抽象层

> 源码：`llm/src/`、`core/src/session/llm/`

## 四轴路由分解（核心设计）

OpenCode LLM 层最核心的设计是将一次 Provider 调用分解为四个正交维度：

```
Route = {
  Protocol   — 语义 API 契约：body 构造、stream 解析、事件状态机
  Endpoint   — URL 构造：baseURL / path / query
  Auth       — 每请求传输认证：bearer token / API key header
  Framing    — 字节流 → 帧：SSE / AWS event-stream / 二进制
}
```

**核心价值**：DeepSeek、TogetherAI、Cerebras、Fireworks 等共享 `OpenAIChat.protocol`，每个提供商只需 5-15 行配置，而非 300-400 行克隆代码。

## 目录结构

```
llm/src/
├── route/                    # 路由层
│   ├── client.ts             # Route.make() + LLMClient
│   ├── auth.ts               # Auth.bearer / Auth.apiKeyHeader / Auth.passthrough
│   ├── endpoint.ts           # Endpoint.path / url 构造
│   ├── framing.ts            # Framing.sse / Framing.binary
│   ├── executor.ts           # 请求执行
│   ├── protocol.ts           # 协议选择
│   └── transport/            # HTTP + WebSocket 传输
├── protocols/                # 6 种 API 协议
│   ├── openai-chat.ts        # OpenAI Chat Completions
│   ├── openai-responses.ts   # OpenAI Responses API
│   ├── anthropic-messages.ts # Anthropic Messages
│   ├── gemini.ts             # Google Gemini
│   ├── bedrock-converse.ts   # AWS Bedrock Converse
│   └── openai-compatible-chat.ts  # 通用兼容路由
├── providers/                # 12 个 Provider facade
│   ├── openai.ts / anthropic.ts / google.ts / xai.ts
│   ├── azure.ts / amazon-bedrock.ts / cloudflare.ts
│   ├── github-copilot.ts / openrouter.ts
│   └── openai-compatible.ts / openai-compatible-profile.ts
├── schema/                   # LLM 专用类型
│   ├── messages.ts           # 消息类型
│   ├── events.ts             # 流事件
│   ├── errors.ts             # LLM 错误
│   ├── ids.ts                # ID 类型
│   └── options.ts            # 请求选项
├── llm.ts                    # LLM.request/stream/generate
├── provider.ts               # Provider 类型
├── tool.ts                   # Tool 构造器
├── tool-runtime.ts           # Tool 调度引擎
├── cache-policy.ts           # 缓存策略
└── utils/record.ts           # 请求录制（调试用）
```

## 协议层

每个协议文件实现一个 `Protocol` 接口：

```ts
interface Protocol {
  id: string
  prepare(request: LLM.Request): Effect<PreparedRequest>
  parseEvent(event: unknown): Effect<LLM.Event>
  // SSE 流解析 + 工具调用提取
}
```

### 协议对比

| 协议 | 复杂度 | 特性 |
|------|--------|------|
| `openai-chat` | 高 | 完整 Chat Completions + Function Calling + streaming |
| `openai-responses` | 中 | OpenAI Responses API |
| `anthropic-messages` | 高 | Anthropic Messages + tool_use + extended thinking |
| `gemini` | 中 | Gemini + 特殊 tool schema + file upload |
| `bedrock-converse` | 中 | AWS Bedrock + SigV4 签名 |
| `openai-compatible-chat` | 低 | 通用兼容路由（自动适配差异） |

## Provider 层

每个 Provider 文件定义路由的四维参数：

```ts
// 例：providers/deepseek.ts
export const DeepSeekProvider = Provider.make({
  id: "deepseek",
  name: "DeepSeek",
  api: Provider.Api.AISDK,
  route: Route.make({
    protocol: OpenAIChatProtocol,   // 复用 OpenAI Chat 协议
    endpoint: Endpoint.path("/v1"),
    auth: Auth.bearer("DEEPSEEK_API_KEY"),
    framing: Framing.sse,
  }),
  models: [
    Model.make({ id: "deepseek-chat", ... }),
    Model.make({ id: "deepseek-reasoner", ... }),
  ],
})
```

## 高级 LLM API

```ts
// llm/src/llm.ts
LLM.request(config) → Effect<LLM.Response>    // 单次请求
LLM.stream(config)   → Stream<LLM.Event>       // SSE 流
LLM.generate(config) → Effect<LLM.Output>      // 请求+解析

// 工具集成
LLM.tool(toolDef) → Tool<Input, Output>        // 类型安全工具
```

## Tool Runtime（工具调度引擎）

```ts
// llm/src/tool-runtime.ts
ToolRuntime = {
  // 拦截 LLM 响应中的 tool_use → 执行 → 返回 tool_result
  intercept(response: LLM.Response, tools: Tools): Effect<LLM.Response>

  // 循环直到无 tool_use
  runLoop(request: LLM.Request, tools: Tools): Effect<LLM.Output>
}
```

## 请求录制器

```ts
// llm/src/utils/record.ts
// 录制 LLM 请求/响应用于调试和回放
Record.record(request, response) → Effect<void>
Record.replay(request) → Effect<LLM.Response>
```

## Session 中的 LLM 调用

文件：`opencode/src/session/llm/`

```
opencode/src/session/llm/
├── request.ts         # 构建 LLM 请求（prompt + history + tools + config）
├── ai-sdk.ts          # Vercel AI SDK 适配
├── native-request.ts  # 原生 LLM 请求
├── native-runtime.ts  # 原生运行时
└── AGENTS.md
```

## Prompt 系统

文件：`opencode/src/session/prompt/`（13 个模板）

```
anthropic.txt  beast.txt  build-switch.txt  codex.txt  copilot-gpt-5.txt
default.txt  gemini.txt  gpt.txt  kimi.txt  plan-mode.txt
plan-reminder-anthropic.txt  plan.txt  trinity.txt
```

每个模板按 Provider 定制 System Prompt 的风格和指令格式。

## Compaction

文件：`core/src/session/compaction.ts`、`opencode/src/session/compaction.ts`

| 常量 | 值 | 说明 |
|------|-----|------|
| `PRUNE_MINIMUM` | 20000 | 开始裁剪的 token 阈值 |
| `PRUNE_PROTECT` | 40000 | 保护区间（不裁剪最后 40k token） |
| `DEFAULT_TAIL_TURNS` | 2 | 保留最后 N 轮对话 |

Compaction 策略：
1. 检测上下文长度是否超过 PRUNE_MINIMUM
2. 保留最后 PRUNE_PROTECT token 的内容
3. 对旧内容提取摘要 → 注入 system prompt
4. 保护 skill 工具的输出不被裁剪
