# 供应商 API 调用缓存与成本优化 — 设计文档

日期：2026-08-11（2026-08-11 更新：范围对齐 — 移除并发去重，新增 OpenAI 兼容缓存）
状态：已批准（范围：断点注入 + OpenAI 兼容缓存 + 成本核算 + 前端展示）
参考：OpenCode（MIT）`packages/llm/src/cache-policy.ts`、`packages/llm/src/protocols/anthropic-messages.ts`、`packages/core/src/config/provider.ts`、`packages/console/function/src/log-processor.ts`、`packages/console/app/src/routes/zen/util/provider/openai-compatible.ts`

## 目标

以最大程度降低用户的 API 调用成本（省钱），在 `ai-digital-life` 中实现四类能力：

1. **Prompt Caching 断点注入** — Anthropic 显式 `cache_control`，工具/系统提示/最新用户消息三处断点，工具循环内每轮命中前缀缓存
2. **OpenAI 兼容缓存识别** — DeepSeek/OpenAI 兼容族服务端自动前缀缓存（隐式），从 usage 解析缓存命中/写入 token 并计入成本
3. **Cache usage 解析 + 真实成本核算** — 解析 `cache_creation_input_tokens` / `cache_read_input_tokens`（及 OpenAI 兼容 `cached_tokens` / `prompt_cache_hit_tokens`），按模型单价计算每次调用真实花费
4. **模型单价配置 + 成本展示 UI** — 模型定义带 cache read/write 单价，前端展示每次调用/每会话估算成本

## 现状评估

当前项目 **没有任何** 供应商 API 调用缓存/成本优化：

- 所有 provider（`crates/model-gateway/src/providers/anthropic.rs:205`、`openai.rs`、`google.rs`、`ollama.rs`、`openrouter.rs`）构造请求体时不带 `cache_control`
- usage 只解析 `prompt_tokens`/`completion_tokens`/`total_tokens`，忽略 cache 读写 token（`anthropic.rs:224-226`）
- `ModelDefinition`（`crates/types/src/types/config.rs:77`）无单价字段
- 现存 "cache" 均为无关内容（浏览器 favicon、CI 日志、git 图表、头像缓存）

调用链：`agent_loop.rs:306-310` 每轮重发相同 `[System, User(prompt)]` 前缀，工具结果由 executor 注入 —— 理想缓存场景，每轮命中相同前缀。

## 架构

在 `crates/model-gateway` 内新增「成本优化层」，位于 `ModelGateway::chat/chat_stream`（`crates/model-gateway/src/lib.rs:240`）与 provider adapter 之间：

```
ModelGateway::chat_stream
   ├─ ① 缓存策略注入 (cache-policy.rs + anthropic.rs)
   │     system + 最新user消息 + 末tool 加 cache_control（上限4）
   ├─ ② usage解析 (model.rs + anthropic.rs + openai.rs)
   │     cache_*_input_tokens / cached_tokens / prompt_cache_hit_tokens 解析
   └─ ③ 成本计算 (pricing.rs)
         按单价算出每次调用成本
```

## ① Prompt Caching 断点注入（Anthropic）

### `ChatOptions` 扩展（`crates/model-gateway/src/adapter.rs`）

```rust
pub enum CachePolicy { Auto, Off }  // Default = Auto

pub struct ChatOptions {
    pub temperature: Option<f32>,
    pub top_p: Option<f32>,
    pub max_tokens: Option<u32>,
    pub agent_id: Option<AgentId>,
    pub tools: Vec<ToolDefinition>,
    pub cache_policy: CachePolicy,   // 新增，默认 Auto
}
```

现有调用点不受影响（新增字段带默认值）。

### 新增 `crates/model-gateway/src/cache-policy.rs`

对齐 OpenCode `cache-policy.ts`：

- `CacheBreakpoints { remaining: u32, dropped: u32 }`，cap = 4（对齐 `ANTHROPIC_BREAKPOINT_CAP`）
- 分配规则：最后一个 tool 定义 → 最后一条 system → 最新一条 user 消息
- `ttl_bucket(ttl_seconds)`：`>= 3600` 返回 `1h`，否则 `5m`（Anthropic 仅接受 `5m`/`1h` 两档）
- 断点用尽自动丢弃（`dropped` 计数），不影响请求正确性

### `anthropic.rs` 修改（`chat` + `chat_stream` 两条路径）

构造 body 时若 `cache_policy == Auto` 且该消息/工具未被手动标记：

- `system` 字符串 → `[{ "type": "text", "text": …, "cache_control": { "type": "ephemeral" } }]`
- 最新一条 user 消息的 `content` → `[{ "type": "text", "text": …, "cache_control": { "type": "ephemeral" } }]`
- 最后一个 `ToolDefinition` → 其 JSON 内加 `"cache_control": { "type": "ephemeral" }`（预留；当前 `ChatOptions.tools` 未被 agent loop 填充，不触发，不影响收益）

TTL：默认 5m。与 OpenCode 一致，`Auto` 策略在数学上占优（write 1.25x / read 0.1x，5 分钟内一次复用即回本）。

## ② Cache usage 解析（OpenCode `AnthropicUsage` / `oaCompatHelper.normalizeUsage` 移植）

### `ModelTokenUsage` 扩展（`crates/types/src/types/model.rs:17`）

```rust
pub struct ModelTokenUsage {
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
    pub total_tokens: Option<u32>,
    pub cache_creation_input_tokens: Option<u32>,  // 新增
    pub cache_read_input_tokens: Option<u32>,      // 新增
    pub estimated: Option<bool>,
}
```

同步更新：
- `frontend/src/kernel/types-model.ts:21` 的 `ModelTokenUsage`
- `frontend/src/shared/ipc-types.generated.ts`（如 ts-rs 生成引用该类型）

### `anthropic.rs` 解析

- 非流式 `chat`：从 `usage.cache_creation_input_tokens` / `usage.cache_read_input_tokens` 解析
- 流式 `chat_stream`：`message_delta` 事件携带 `usage`，需在 `extract_anthropic_event` 补 `message_delta → SseEvent::Done(usage)` 路径（当前仅处理 `content_block_delta` 与 `message_stop`，见 `anthropic.rs:298-317`）

### `openai.rs` / `openrouter.rs` 解析（OpenAI 兼容族）

对齐 OpenCode `oaCompatHelper.normalizeUsage`（`packages/console/app/src/routes/zen/util/provider/openai-compatible.ts`）——OpenAI 兼容族为**服务端自动前缀缓存（隐式，无需请求头注入）**，只需从 usage 识别缓存 token：

| usage 字段 | 语义 | 映射 |
|---|---|---|
| `prompt_tokens_details.cached_tokens` | 缓存读取（xAI / alibaba / OpenAI） | `cache_read_input_tokens` |
| `cached_tokens` | 缓存读取（moonshot 顶层字段） | `cache_read_input_tokens` |
| `prompt_cache_hit_tokens` | 缓存读取（DeepSeek） | `cache_read_input_tokens` |
| `prompt_cache_miss_tokens` | 缓存未命中（DeepSeek） | 计入 `prompt_tokens`（正常输入价） |
| `prompt_tokens_details.cache_creation_input_tokens` | 缓存写入（alibaba） | `cache_creation_input_tokens` |

非流式 `chat` 与流式 `chat_stream`（`usage` 随最后一个 chunk / `[DONE]` 前携带）两条路径均需解析。OpenAI 流式需确保请求体带 `stream_options: { include_usage: true }`（对齐 OpenCode `modifyBody`）才能收到 usage 事件。

> 说明：DeepSeek 自动缓存**无需注入任何请求头**，服务端按前缀自动命中；本项目不需要仿 OpenCode 的 `prompt_cache_key`（那是 deepinfra/cerebras 专有字段，非 OpenAI 兼容族通用）。

## ③ 成本计算 + 定价表（OpenCode `Cost` + `log-processor` 移植）

### 新增类型（`crates/types/src/types/config.rs`）

```rust
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
pub struct ModelCost {
    pub input_per_mtok: f64,        // USD / 百万输入 token
    pub output_per_mtok: f64,       // USD / 百万输出 token
    pub cache_read_per_mtok: f64,   // USD / 百万缓存读取 token
    pub cache_write_per_mtok: f64,  // USD / 百万缓存写入 token
}
```

`ModelDefinition` 新增 `cost: Option<ModelCost>`（ts-rs 同步到前端）。

### 新增 `crates/model-gateway/src/pricing.rs`

- 内置定价表 `lookup_cost(provider_id, model_id) -> Option<ModelCost>`：按 `(provider, model_id 前缀)` 覆盖已知模型（claude-3-5-sonnet / claude-3-7-sonnet / claude-sonnet-4 / claude-opus-4、gpt-4o / gpt-4o-mini / gpt-4.1 / o3 / o4-mini、gemini-1.5-pro / 1.5-flash / 2.x、deepseek-chat / deepseek-reasoner），Ollama = `Some(ModelCost::zero())`，未知模型 = `None`
- `compute_cost(usage, cost) -> ModelUsageCost`：

```
input × input_per_mtok
+ cache_creation_input × cache_write_per_mtok
+ cache_read_input × cache_read_per_mtok
+ completion × output_per_mtok
```

- `ModelUsageCost { input_cost, output_cost, cache_read_cost, cache_write_cost, total_cost }`（USD，micro-USD 精度，对齐 OpenCode `cost_*_microcents` 思路）
- `ModelUsageCost` 定义于 `crates/types/src/types/model.rs`（与 `ModelTokenUsage` 同文件，`#[derive(TS)]` 供前端同步）
- `ModelTokenUsage` 新增 `cost: Option<ModelUsageCost>`

### 附加时机

provider 构造 usage 时调用 `pricing::compute_cost(...)`，通过共享的 `pricing::lookup_cost(provider_id, model_id)` 解析单价后附加到 usage。

## ④ OpenAI 兼容缓存识别（隐式前缀缓存）

### 机制

OpenAI 兼容族（DeepSeek / OpenAI / OpenRouter 等）采用**服务端自动前缀缓存**：
- 无显式 `cache_control`（OpenCode `cache-policy.ts` 的 `RESPECTS_INLINE_HINTS` 集合只含 `anthropic-messages` / `bedrock-converse`，OpenAI 兼容被排除）
- 服务端按相同前缀自动命中缓存，命中部分按低价计费
- 本项目无需注入缓存请求头；只需**正确解析缓存 token 并计入成本**（见 ② 的字段映射表）

### DeepSeek 特例

DeepSeek 自动缓存命中后，usage 返回 `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens`：
- `prompt_cache_hit_tokens` → `cache_read_input_tokens`（按缓存读价计费）
- `prompt_cache_miss_tokens` → 归入 `prompt_tokens`（按正常输入价计费）

多轮会话（重复发送 `[System, User(prompt)]` 前缀）时命中率提升，直接省钱。

## ⑤ 前端成本展示

- `frontend/src/kernel/types-model.ts`：扩展 `ModelTokenUsage`（cache 字段 + `cost`）
- `TokenUsage.tsx`：新增 cache read/write token 行 + 成本行（i18n key + 货币格式化）
- `RunSummaryBlock.tsx`：run 汇总显示成本
- 会话成本累计：从 run activity 的 usage 汇总（sessionSlice / activityUtils）
- `ModelSettings` 页：已启用模型卡片显示单价（只读，来自内置定价表）
- 双端一致：mock-bridge / preview-bridge 的 usage fixture 补 `cost` 字段；所有新文案走 i18n

## 测试策略（红绿，遵循 mandatory-testing）

| 模块 | 测试 |
|------|------|
| `cache-policy.rs` | 断点分配、上限 4 丢弃、空输入、TTL 分桶（对齐 OpenCode cache-policy.test.ts） |
| `anthropic.rs` | cache_control body 结构断言（system 数组、最新 user 数组、断点耗尽降级）、流式 message_delta usage 解析 |
| `openai.rs` / `openrouter.rs` | usage 各缓存字段映射（`prompt_tokens_details.cached_tokens`、顶层 `cached_tokens`、`prompt_cache_hit_tokens` / `prompt_cache_miss_tokens`、`cache_creation_input_tokens`）、流式 usage 事件解析 |
| `pricing.rs` | 已知/未知模型查找、成本计算、Ollama 零成本、micro-USD 精度 |
| 前端 | TokenUsage / RunSummaryBlock 渲染成本、i18n key 存在性 |

## 风险与边界

- 缓存标记永不改变语义，仅加断点；超限丢弃保底
- 定价表为近似值，成本 UI 标注「估算」
- 工具断点预留未激活（当前 tools 未走 ChatOptions），不影响本轮收益
- OpenAI 兼容缓存为隐式，命中与否由服务端决定，本项目只负责解析与计费（若服务端未开启缓存，`cache_*` 字段缺省，回退为正常输入价，成本计算仍正确）
- 与现有「禁止向后兼容层」约束一致：所有新类型为新字段，不引入迁移代码

## 验收标准

1. Anthropic 请求 body 在 Auto 策略下含 `cache_control`（system + 最新 user 消息）
2. usage 正确解析缓存读写 token（Anthropic 非流式 + 流式；OpenAI 兼容非流式 + 流式）
3. 每次调用带 `cost`，前端展示单次 + 会话成本
4. 629 Rust + 1260 前端测试全部通过，clippy 0 警告，lint 0 error
